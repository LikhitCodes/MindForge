"""
REST API views for FocusTrack core.
"""

import random
import string
import socket
from datetime import datetime, timezone, timedelta

from django.utils import timezone as dj_timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.models import FocusSession, MobileSignal, DesktopSignal, FocusScoreSnapshot, DistractionEvent
from core.serializers import (
    FocusSessionSerializer, MobileSignalSerializer,
    DesktopSignalSerializer, FocusScoreSnapshotSerializer, DistractionEventSerializer
)
from core.signals_processor import SignalsProcessor

processor = SignalsProcessor()


def _generate_session_id():
    """Generate a unique 6-character alphanumeric session ID."""
    chars = string.ascii_uppercase + string.digits
    while True:
        sid = ''.join(random.choices(chars, k=6))
        if not FocusSession.objects.filter(session_id=sid).exists():
            return sid


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def _get_active_session(session_id):
    try:
        return FocusSession.objects.get(session_id=session_id)
    except FocusSession.DoesNotExist:
        return None


# ---------------------------------------------------------------------------
# POST /api/sessions/create/
# ---------------------------------------------------------------------------

@api_view(['POST'])
def create_session(request):
    topic = request.data.get('topic', '').strip()
    duration_minutes = request.data.get('duration_minutes')
    sensitivity = request.data.get('sensitivity', 'balanced')

    if not topic:
        return Response({'error': 'topic is required.'}, status=400)
    if duration_minutes is None:
        return Response({'error': 'duration_minutes is required.'}, status=400)
    try:
        duration_minutes = int(duration_minutes)
    except (ValueError, TypeError):
        return Response({'error': 'duration_minutes must be an integer.'}, status=400)
    if sensitivity not in ('strict', 'balanced', 'relaxed'):
        return Response({'error': 'sensitivity must be strict, balanced, or relaxed.'}, status=400)

    session_id = _generate_session_id()
    session = FocusSession.objects.create(
        session_id=session_id,
        topic=topic,
        duration_minutes=duration_minutes,
        sensitivity=sensitivity,
    )

    # Use LAN IP instead of request.get_host() (which is always localhost) for mobile PWA
    lan_ip = get_local_ip()
    host = f"{lan_ip}:8000"
    scheme = 'wss' if request.is_secure() else 'ws'
    http_scheme = 'https' if request.is_secure() else 'http'

    # The WS URL for the desktop (React) can stay local, but the PWA URL MUST be the network IP
    desktop_ws = f"{scheme}://{request.get_host()}/ws/session/{session_id}/"

    return Response({
        'session_id': session_id,
        'ws_url': desktop_ws,
        'pwa_url': f'{http_scheme}://{host}/join?session={session_id}',
    }, status=201)


# ---------------------------------------------------------------------------
# GET /api/sessions/<session_id>/status/
# ---------------------------------------------------------------------------

@api_view(['GET'])
def session_status(request, session_id):
    session = _get_active_session(session_id)
    if session is None:
        return Response({'error': 'Session not found.'}, status=404)

    latest_score = session.score_snapshots.first()
    latest_mobile = session.mobile_signals.first()
    latest_desktop = session.desktop_signals.first()

    return Response({
        'session_id': session.session_id,
        'topic': session.topic,
        'is_active': session.is_active,
        'desktop_connected': session.desktop_connected,
        'mobile_connected': session.mobile_connected,
        'mobile_connected_at': session.mobile_connected_at,
        'desktop_connected_at': session.desktop_connected_at,
        'focus_score': latest_score.score if latest_score else None,
        'latest_mobile_signal': MobileSignalSerializer(latest_mobile).data if latest_mobile else None,
        'latest_desktop_signal': DesktopSignalSerializer(latest_desktop).data if latest_desktop else None,
    })


# ---------------------------------------------------------------------------
# POST /api/sessions/<session_id>/end/
# ---------------------------------------------------------------------------

@api_view(['POST'])
def end_session(request, session_id):
    session = _get_active_session(session_id)
    if session is None:
        return Response({'error': 'Session not found.'}, status=404)
    if not session.is_active:
        return Response({'error': 'Session already ended.'}, status=409)

    now = dj_timezone.now()
    session.is_active = False
    session.ended_at = now
    session.desktop_connected = False
    session.mobile_connected = False

    # Calculate final stats from distraction events
    distraction_events = session.distraction_events.filter(was_forgiven=False)
    total_distracted_seconds = 0
    for ev in distraction_events:
        end = ev.ended_at or now
        delta = (end - ev.started_at).total_seconds()
        total_distracted_seconds += max(0, delta)

    total_session_seconds = (now - session.started_at).total_seconds()
    total_focused_seconds = max(0, total_session_seconds - total_distracted_seconds)

    session.distracted_minutes = round(total_distracted_seconds / 60, 2)
    session.focused_minutes = round(total_focused_seconds / 60, 2)

    # Final focus score from latest snapshot
    latest_snapshot = session.score_snapshots.first()
    if latest_snapshot:
        session.focus_score = latest_snapshot.score

    session.save()

    distraction_list = DistractionEventSerializer(
        session.distraction_events.all(), many=True
    ).data

    # Broadcast session ended to all WS clients
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer
    channel_layer = get_channel_layer()
    if channel_layer:
        async_to_sync(channel_layer.group_send)(
            f'session_{session.session_id}',
            {
                'type': 'session_ended',
                'session_id': session.session_id,
                'message': 'Session ended by user.'
            }
        )

    return Response({
        'session_id': session.session_id,
        'topic': session.topic,
        'started_at': session.started_at,
        'ended_at': session.ended_at,
        'focus_score': session.focus_score,
        'focused_minutes': session.focused_minutes,
        'distracted_minutes': session.distracted_minutes,
        'distraction_events': distraction_list,
    })


# ---------------------------------------------------------------------------
# POST /api/sessions/<session_id>/mobile-signal/  (REST fallback)
# ---------------------------------------------------------------------------

@api_view(['POST'])
def mobile_signal_fallback(request, session_id):
    session = _get_active_session(session_id)
    if session is None:
        return Response({'error': 'Session not found.'}, status=404)
    if not session.is_active:
        return Response({'error': 'Session has ended.'}, status=409)

    event = request.data.get('event')
    if not event:
        return Response({'error': 'event is required.'}, status=400)

    # Parse timestamp
    ts_raw = request.data.get('timestamp')
    if ts_raw:
        try:
            ts = datetime.fromtimestamp(int(ts_raw) / 1000, tz=timezone.utc)
        except (ValueError, TypeError):
            ts = datetime.now(tz=timezone.utc)
    else:
        ts = datetime.now(tz=timezone.utc)

    signal = MobileSignal.objects.create(
        session=session,
        signal_type=event,
        timestamp=ts,
        magnitude=request.data.get('magnitude'),
        duration_ms=request.data.get('duration_ms') or request.data.get('away_duration_ms'),
        raw_data=request.data,
    )

    # Run correlation
    alert_result = processor.correlate(session, signal)
    if alert_result.alerted:
        DistractionEvent.objects.create(
            session=session,
            started_at=signal.timestamp,
            distraction_type=alert_result.distraction_type or 'phone_use',
            description=alert_result.message or '',
            severity=alert_result.severity or 'medium',
            score_impact=-15.0 * alert_result.confidence,
        )

    return Response({'status': 'saved', 'alerted': alert_result.alerted}, status=201)


# ---------------------------------------------------------------------------
# GET /api/sessions/<session_id>/live-state/
# ---------------------------------------------------------------------------

@api_view(['GET'])
def live_state(request, session_id):
    session = _get_active_session(session_id)
    if session is None:
        return Response({'error': 'Session not found.'}, status=404)

    mobile_signals = session.mobile_signals.all()[:10]
    desktop_signals = session.desktop_signals.all()[:10]
    latest_score = session.score_snapshots.first()
    latest_distraction = session.distraction_events.first()

    return Response({
        'session_id': session.session_id,
        'is_active': session.is_active,
        'desktop_connected': session.desktop_connected,
        'mobile_connected': session.mobile_connected,
        'focus_score': latest_score.score if latest_score else None,
        'verdict': latest_score.verdict if latest_score else 'unknown',
        'mobile_signals': MobileSignalSerializer(mobile_signals, many=True).data,
        'desktop_signals': DesktopSignalSerializer(desktop_signals, many=True).data,
        'latest_distraction': DistractionEventSerializer(latest_distraction).data if latest_distraction else None,
        'mobile_signal_count': session.mobile_signals.count(),
        'desktop_signal_count': session.desktop_signals.count(),
        'distraction_count': session.distraction_events.count(),
    })
