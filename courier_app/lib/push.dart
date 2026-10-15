import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'api.dart';

/// Lets us show a banner when a notification arrives while the app is open.
final messengerKey = GlobalKey<ScaffoldMessengerState>();

class Push {
  static bool _started = false;
  static String? _token;
  static StreamSubscription<String>? _tokenSub;
  static StreamSubscription<RemoteMessage>? _messageSub;

  /// Registers this phone for notifications. If Firebase is not set up yet, the app keeps working without push.
  static Future<void> start(Api api) async {
    if (_started) return;
    try {
      await Firebase.initializeApp();
      final m = FirebaseMessaging.instance;
      final perm = await m.requestPermission();
      if (perm.authorizationStatus == AuthorizationStatus.denied) return;
      _token = await m.getToken();
      if (_token != null) await api.post('/devices', {'token': _token});
      _tokenSub = m.onTokenRefresh.listen((t) {
        _token = t;
        api.post('/devices', {'token': t}).catchError((_) {});
      });
      _messageSub = FirebaseMessaging.onMessage.listen((msg) {
        final n = msg.notification;
        if (n == null) return;
        messengerKey.currentState?.showSnackBar(SnackBar(content: Text('${n.title}: ${n.body}')));
      });
      _started = true;
    } catch (_) {}
  }

  /// Call before signing out so this phone stops getting the old account's notifications.
  static Future<void> stop(Api api) async {
    final token = _token;
    if (token != null) {
      try {
        await api.post('/devices/remove', {'token': token});
      } catch (_) {}
    }
    await _tokenSub?.cancel();
    await _messageSub?.cancel();
    _tokenSub = null;
    _messageSub = null;
    _token = null;
    _started = false;
  }
}
