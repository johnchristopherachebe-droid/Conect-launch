import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'application.dart';
import 'brand.dart';
import 'home_tab.dart';
import 'main.dart' show api;
import 'profile_tab.dart';
import 'push.dart';
import 'wallet.dart';

/// Signed-in rider app: owns the data and polling, and switches between the three tabs.
class CourierShell extends StatefulWidget {
  final VoidCallback onSignOut;
  const CourierShell({super.key, required this.onSignOut});
  @override
  State<CourierShell> createState() => _CourierShellState();
}

class _CourierShellState extends State<CourierShell> {
  int tab = 0;
  List<Map<String, dynamic>> active = [], available = [];
  bool loading = true;
  bool online = false;
  String? error;
  int maxActive = 5;
  double todayEarnings = 0;
  DateTime? _walletAt;
  Map<String, dynamic>? profileData;
  Timer? poll, gps;

  @override
  void initState() {
    super.initState();
    Push.start(api);
    refresh();
    poll = Timer.periodic(const Duration(seconds: 8), (_) => refresh());
    gps = Timer.periodic(const Duration(seconds: 10), (_) => sendLocation());
  }

  @override
  void dispose() {
    poll?.cancel();
    gps?.cancel();
    super.dispose();
  }

  bool get approved => profileData?['approved'] == true;

  Future<void> refresh() async {
    try {
      final p = Map<String, dynamic>.from(await api.get('/courier/profile'));
      if (!mounted) return;
      profileData = p;
      maxActive = (p['max_active'] as num?)?.toInt() ?? maxActive;
      if (p['approved'] != true) {
        setState(() {
          active = [];
          available = [];
          loading = false;
          error = null;
        });
        return;
      }
      final a = await api.get('/courier/active') as List;
      final v = await api.get('/courier/available') as List;
      if (!mounted) return;
      setState(() {
        active = a.cast<Map<String, dynamic>>();
        available = v.cast<Map<String, dynamic>>();
        loading = false;
        error = null;
      });
      _loadEarnings();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.message == 'Sign in required') return widget.onSignOut();
      setState(() {
        error = e.message;
        loading = false;
      });
    }
  }

  /// Today's delivery earnings for the header. Checked at most every 45 seconds.
  Future<void> _loadEarnings() async {
    final last = _walletAt;
    if (last != null && DateTime.now().difference(last).inSeconds < 45) return;
    _walletAt = DateTime.now();
    try {
      final d = Map<String, dynamic>.from(await api.get('/wallet') as Map);
      final now = DateTime.now();
      var sum = 0.0;
      for (final e in (d['entries'] as List? ?? const [])) {
        if (e['kind'] != 'delivery_earning') continue;
        final t = DateTime.tryParse('${e['created_at']}')?.toLocal();
        if (t != null && t.year == now.year && t.month == now.month && t.day == now.day) {
          sum += n(e['amount']).toDouble();
        }
      }
      if (mounted) setState(() => todayEarnings = sum);
    } catch (_) {/* the header just keeps its last number */}
  }

  /// Shares location only while you are online or have a delivery in progress.
  Future<void> sendLocation() async {
    if (active.isEmpty && !online) return;
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return;
      final p = await Geolocator.getCurrentPosition();
      await api.put('/courier/location', {'lat': p.latitude, 'lng': p.longitude});
    } catch (_) {/* try again on the next tick */}
  }

  void toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> act(String path, [Object? body]) async {
    try {
      await api.post(path, body);
      _walletAt = null; // pick up new earnings straight away
      await refresh();
      sendLocation();
    } on ApiException catch (e) {
      toast(e.message);
      refresh();
    }
  }

  Future<void> _open(String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && mounted) toast('Could not open that on this device.');
  }

  void _advance(Map<String, dynamic> o) {
    if (o['status'] == 'picked_up') {
      confirmDelivery(o);
    } else {
      act('/courier/orders/${o['id']}/advance');
    }
  }

  Future<void> confirmDelivery(Map<String, dynamic> o) async {
    final pin = TextEditingController();
    final entered = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Confirm delivery'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('${o['store_name']} → ${(o['customer_name'] ?? 'customer')}', style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          const Text('Ask the customer for their 4-digit delivery PIN.'),
          const SizedBox(height: 12),
          TextField(
            controller: pin,
            autofocus: true,
            keyboardType: TextInputType.number,
            maxLength: 4,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: 8),
            decoration: const InputDecoration(counterText: '', hintText: '••••'),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, pin.text.trim()), child: const Text('Confirm')),
        ],
      ),
    );
    pin.dispose();
    if (entered == null) return;
    if (!RegExp(r'^\d{4}$').hasMatch(entered)) return toast('Enter the 4-digit PIN.');
    await act('/courier/orders/${o['id']}/advance', {'pin': entered});
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    if (profileData == null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(error ?? 'Could not load your courier profile.', textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(onPressed: refresh, child: const Text('Try again')),
              TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
            ]),
          ),
        ),
      );
    }

    if (!approved) {
      return GradientPage(
        title: 'Courier application',
        subtitle: 'Pending verification',
        actions: [
          IconButton(tooltip: 'Refresh', icon: const Icon(Icons.refresh_rounded, color: Colors.white), onPressed: refresh),
          IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout, color: Colors.white), onPressed: widget.onSignOut),
        ],
        child: CourierApplication(profileData: profileData!, onSaved: refresh),
      );
    }

    final pages = <Widget>[
      HomeTab(
        online: online,
        onOnline: (v) {
          setState(() => online = v);
          if (v) sendLocation();
        },
        active: active,
        available: available,
        maxActive: maxActive,
        todayEarnings: todayEarnings,
        error: error,
        onRefresh: refresh,
        onAdvance: _advance,
        onAccept: (o) => act('/courier/orders/${o['id']}/accept'),
        onOpen: _open,
      ),
      // A fresh WalletView each time the tab opens, so the balance is always current.
      GradientPage(
        title: 'Earnings',
        subtitle: 'Balance and withdrawals',
        child: WalletView(
          send: (method, path, [body]) => switch (method) {
            'GET' => api.get(path),
            'PUT' => api.put(path, body ?? {}),
            _ => api.post(path, body),
          },
        ),
      ),
      ProfileTab(profileData: profileData!, maxActive: maxActive, onSignOut: widget.onSignOut),
    ];

    return Scaffold(
      body: pages[tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) => setState(() => tab = i),
        destinations: [
          NavigationDestination(
            icon: Badge(
              isLabelVisible: available.isNotEmpty,
              label: Text('${available.length}'),
              child: const Icon(Icons.two_wheeler_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: available.isNotEmpty,
              label: Text('${available.length}'),
              child: const Icon(Icons.two_wheeler),
            ),
            label: 'Deliveries',
          ),
          const NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: 'Earnings',
          ),
          const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}
