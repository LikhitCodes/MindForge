"""
FocusTrack WebSocket Consumer.
Handles connections from both Chrome extension (desktop) and mobile PWA
on the same endpoint: /ws/session/<session_id>/
"""

import json
import logging
from datetime import datetime, timezone

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from core.signals_processor import SignalsProcessor

logger = logging.getLogger(__name__)
processor = SignalsProcessor()


class FocusSessionConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.group_name = f'session_{self.session_id}'
        self.device = None  # set on first message

        # Validate session exists and is active
        session = await self._get_session()
        if session is None:
            logger.warning(f'WS REJECTED — session {self.session_id} not found or not active')
            await self.close(code=4004)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info(f'WS connected to {self.session_id}')


    async def disconnect(self, close_code):
        if self.device:
            await self._mark_device_disconnected()
            await self.channel_layer.group_send(self.group_name, {
                'type': 'device_disconnected',
                'device': self.device,
                'session_id': self.session_id,
            })
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info(f'WS disconnected from {self.session_id} (device={self.device})')

    async def receive(self, text_data):
        """Route incoming message by device field."""
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON payload.',
            }))
            return

        # Validate required fields
        device = data.get('device')
        event = data.get('event')
        session_id = data.get('session_id')

        if not all([device, event, session_id]):
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Missing required fields: device, event, session_id.',
            }))
            return

        if session_id != self.session_id:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'session_id mismatch.',
            }))
            return

        self.device = device

        # Validate session still active
        session = await self._get_session()
        if session is None:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Session not found or has ended.',
            }))
            return

        if device == 'mobile':
            await self._handle_mobile_event(session, event, data)
        elif device == 'desktop':
            await self._handle_desktop_event(session, event, data)
        else:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': f'Unknown device type: {device}',
            }))

    # -----------------------------------------------------------------------
    # Mobile event handling
    # -----------------------------------------------------------------------

    async def _handle_mobile_event(self, session, event, data):
        # 1. Save signal
        signal = await self._save_mobile_signal(session, event, data)

        # 2. Handle session_joined specifically
        if event == 'session_joined':
            await self._mark_mobile_connected(session)
            # Broadcast to group so desktop gets notified
            await self.channel_layer.group_send(self.group_name, {
                'type': 'mobile_connected_notification',
                'session_id': self.session_id,
                'mobile_connected_at': self._now_iso(),
            })
            # ACK back to mobile
            session_data = await self._get_session_data(session)
            await self.send(text_data=json.dumps({
                'type': 'session_joined_ack',
                'topic': session_data['topic'],
                'duration_minutes': session_data['duration_minutes'],
                'session_id': self.session_id,
            }))
            return

        if event == 'session_left':
            await self._mark_mobile_disconnected(session)
            await self.channel_layer.group_send(self.group_name, {
                'type': 'device_disconnected',
                'device': 'mobile',
                'session_id': self.session_id,
            })
            return

        # 3. Run correlation
        alert_result = await database_sync_to_async(processor.correlate)(session, signal)

        # 4. Broadcast alert if triggered
        if alert_result.alerted:
            await self.channel_layer.group_send(self.group_name, {
                'type': 'distraction_alert',
                'alert_type': alert_result.alert_type,
                'confidence': alert_result.confidence,
                'message': alert_result.message,
                'session_id': self.session_id,
            })
            # Persist distraction event
            await self._save_distraction_event(session, alert_result, signal)

        # 5. Broadcast updated score after every mobile signal
        score_data = await database_sync_to_async(processor.calculate_focus_score)(session)
        await self._save_score_snapshot(session, score_data)
        await self.channel_layer.group_send(self.group_name, {
            'type': 'score_update',
            'score': score_data['score'],
            'verdict': score_data['verdict'],
            'session_id': self.session_id,
        })

    # -----------------------------------------------------------------------
    # Desktop event handling
    # -----------------------------------------------------------------------

    async def _handle_desktop_event(self, session, event, data):
        if event == 'session_start':
            await self._mark_desktop_connected(session)

        # Save signal
        await self._save_desktop_signal(session, event, data)

        # Broadcast desktop state update to group
        await self.channel_layer.group_send(self.group_name, {
            'type': 'desktop_state_update',
            'event': event,
            'url': data.get('url', ''),
            'page_title': data.get('page_title', ''),
            'topic_relevance_score': data.get('topic_relevance_score', 0.5),
            'session_id': self.session_id,
        })

    # -----------------------------------------------------------------------
    # Group message handlers (called by channel layer)
    # -----------------------------------------------------------------------

    async def mobile_connected_notification(self, event):
        await self.send(text_data=json.dumps({
            'type': 'mobile_connected_notification',
            'session_id': event['session_id'],
            'mobile_connected_at': event['mobile_connected_at'],
        }))

    async def distraction_alert(self, event):
        await self.send(text_data=json.dumps({
            'type': 'distraction_alert',
            'alert_type': event['alert_type'],
            'confidence': event['confidence'],
            'message': event['message'],
            'session_id': event['session_id'],
        }))

    async def score_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'score_update',
            'score': event['score'],
            'verdict': event['verdict'],
            'session_id': event['session_id'],
        }))

    async def desktop_state_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'desktop_state_update',
            'event': event['event'],
            'url': event['url'],
            'page_title': event['page_title'],
            'topic_relevance_score': event['topic_relevance_score'],
            'session_id': event['session_id'],
        }))

    async def device_disconnected(self, event):
        await self.send(text_data=json.dumps({
            'type': 'device_disconnected',
            'device': event['device'],
            'session_id': event['session_id'],
        }))

    async def session_ended(self, event):
        await self.send(text_data=json.dumps({
            'type': 'session_ended',
            'session_id': event['session_id'],
            'message': event['message'],
        }))

    # -----------------------------------------------------------------------
    # DB helpers (all wrapped sync→async)
    # -----------------------------------------------------------------------

    @database_sync_to_async
    def _get_session(self):
        from core.models import FocusSession
        try:
            return FocusSession.objects.get(session_id=self.session_id, is_active=True)
        except FocusSession.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_session_data(self, session):
        return {'topic': session.topic, 'duration_minutes': session.duration_minutes}

    @database_sync_to_async
    def _mark_desktop_connected(self, session):
        from django.utils import timezone
        session.desktop_connected = True
        session.desktop_connected_at = timezone.now()
        session.save(update_fields=['desktop_connected', 'desktop_connected_at'])

    @database_sync_to_async
    def _mark_mobile_connected(self, session):
        from django.utils import timezone
        session.mobile_connected = True
        session.mobile_connected_at = timezone.now()
        session.save(update_fields=['mobile_connected', 'mobile_connected_at'])

    @database_sync_to_async
    def _mark_mobile_disconnected(self, session):
        session.mobile_connected = False
        session.save(update_fields=['mobile_connected'])

    @database_sync_to_async
    def _mark_device_disconnected(self):
        from core.models import FocusSession
        try:
            session = FocusSession.objects.get(session_id=self.session_id, is_active=True)
            if self.device == 'mobile':
                session.mobile_connected = False
                session.save(update_fields=['mobile_connected'])
            elif self.device == 'desktop':
                session.desktop_connected = False
                session.save(update_fields=['desktop_connected'])
        except FocusSession.DoesNotExist:
            pass

    @database_sync_to_async
    def _save_mobile_signal(self, session, event, data):
        from core.models import MobileSignal
        from django.utils.dateparse import parse_datetime

        ts_raw = data.get('timestamp')
        if ts_raw:
            # timestamp is Unix ms
            try:
                ts = datetime.fromtimestamp(int(ts_raw) / 1000, tz=timezone.utc)
            except (ValueError, TypeError):
                ts = datetime.now(tz=timezone.utc)
        else:
            ts = datetime.now(tz=timezone.utc)

        return MobileSignal.objects.create(
            session=session,
            signal_type=event,
            timestamp=ts,
            magnitude=data.get('magnitude'),
            duration_ms=data.get('duration_ms') or data.get('away_duration_ms'),
            raw_data=data,
        )

    @database_sync_to_async
    def _save_desktop_signal(self, session, event, data):
        from core.models import DesktopSignal

        ts_raw = data.get('timestamp')
        if ts_raw:
            try:
                ts = datetime.fromtimestamp(int(ts_raw) / 1000, tz=timezone.utc)
            except (ValueError, TypeError):
                ts = datetime.now(tz=timezone.utc)
        else:
            ts = datetime.now(tz=timezone.utc)

        return DesktopSignal.objects.create(
            session=session,
            signal_type=event,
            url=data.get('url', ''),
            page_title=data.get('page_title', ''),
            window_title=data.get('window_title', ''),
            topic_relevance_score=data.get('topic_relevance_score', 0.5),
            timestamp=ts,
            raw_data=data,
        )

    @database_sync_to_async
    def _save_distraction_event(self, session, alert_result, signal):
        from core.models import DistractionEvent
        DistractionEvent.objects.create(
            session=session,
            started_at=signal.timestamp,
            distraction_type=alert_result.distraction_type or 'phone_use',
            description=alert_result.message or '',
            severity=alert_result.severity or 'medium',
            score_impact=-15.0 * alert_result.confidence,
        )

    @database_sync_to_async
    def _save_score_snapshot(self, session, score_data):
        from core.models import FocusScoreSnapshot
        from django.utils import timezone as dj_timezone
        FocusScoreSnapshot.objects.create(
            session=session,
            score=score_data['score'],
            contributing_signals=score_data['components'],
            verdict=score_data['verdict'],
        )
        # Also update the session's focus_score field
        session.focus_score = score_data['score']
        session.save(update_fields=['focus_score'])

    @staticmethod
    def _now_iso():
        return datetime.now(tz=timezone.utc).isoformat()
