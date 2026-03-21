"""
WebSocket URL routing for focustrack.
"""

from django.urls import re_path

from core.consumers import FocusSessionConsumer

websocket_urlpatterns = [
    re_path(r'^ws/session/(?P<session_id>[A-Z0-9]{6})/$', FocusSessionConsumer.as_asgi()),
]
