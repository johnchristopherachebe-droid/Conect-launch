import 'dart:async';
import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'api.dart';
import 'brand.dart';
import 'main.dart' show api;
import 'push.dart';
import 'package:url_launcher/url_launcher.dart';

const _nextLabel = {
  'ready': 'Mark as picked up',
  'picked_up': 'Mark as delivered',
};
const _stageText = {
  'ready': 'Head to the store to collect the order',
  'picked_up': 'On the way to the customer',
};

class JobsScreen extends StatefulWidget {
  final VoidCallback onSignOut;
  const JobsScreen({super.key, required this.onSignOut});
  @override
  State<JobsScreen> createState() => _JobsScreenState();
}

class _JobsScreenState extends State<JobsScreen> {
  List<Map<String, dynamic>> active = [], available = [];
  bool loading = true;
  bool online = false;
  String? error;
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

  Future<void> refresh() async {
    try {
      final p = Map<String, dynamic>.from(await api.get('/courier/profile'));
      if (!mounted) return;
      profileData = p;
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
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.message == 'Sign in required') return widget.onSignOut();
      setState(() {
        error = e.message;
        loading = false;
      });
    }
  }

  /// Shares location only while you are Available or have a delivery in progress.
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
      await refresh();
      sendLocation();
    } on ApiException catch (e) {
      toast(e.message);
      refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final approved = profileData?['approved'] == true;
    return GradientPage(
      title: approved ? 'Deliveries' : 'Courier application',
      subtitle: approved ? (online ? 'You’re online' : 'You’re offline') : 'Pending verification',
      actions: [
        IconButton(tooltip: 'Refresh', icon: const Icon(Icons.refresh_rounded, color: Colors.white), onPressed: refresh),
        IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout, color: Colors.white), onPressed: widget.onSignOut),
      ],
      child: _body(context),
    );
  }

  Widget _body(BuildContext context) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (profileData == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(error ?? 'Could not load your courier profile.', textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: refresh, child: const Text('Try again')),
          ]),
        ),
      );
    }
    if (profileData!['approved'] != true) {
      return CourierOnboarding(profileData: profileData!, onSaved: refresh);
    }
    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        Card(
          child: SwitchListTile(
            secondary: Icon(online ? Icons.wifi_tethering : Icons.wifi_tethering_off,
                color: online ? const Color(0xFF16A34A) : Theme.of(context).hintColor),
            title: Text(online ? 'You’re online' : 'You’re offline', style: const TextStyle(fontWeight: FontWeight.w800)),
            subtitle: const Text('Shares your location so nearby orders can be offered to you.'),
            value: online,
            onChanged: (v) {
              setState(() => online = v);
              if (v) sendLocation();
            },
          ),
        ),
        const SizedBox(height: 16),
        const Text('Your deliveries', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        if (active.isEmpty)
          const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('Nothing in progress. Accept an order below.')),
        for (final o in active) _activeCard(o),
        const SizedBox(height: 16),
        const Text('Available orders', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        if (available.isEmpty)
          const Padding(
              padding: EdgeInsets.symmetric(vertical: 8), child: Text('No orders waiting. This list refreshes by itself.')),
        for (final o in available) _availableCard(o),
      ]),
    );
  }
  Future<void> confirmDelivery(Map<String, dynamic> o) async {
    final pin = TextEditingController();
    final entered = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Confirm delivery'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
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
    if (entered == null) return;
    if (!RegExp(r'^\d{4}$').hasMatch(entered)) return toast('Enter the 4-digit PIN.');
    await act('/courier/orders/${o['id']}/advance', {'pin': entered});
  }
  Future<void> _open(String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && mounted) toast('Could not open that on this device.');
  }

  Widget _customerBlock(Map<String, dynamic> o) {
    const dark = Color(0xFF1B1030);
    final name = (o['customer_name'] ?? 'Customer').toString();
    final phone = (o['customer_phone'] ?? '').toString().trim();
    final note = (o['delivery_note'] ?? '').toString().trim();
    final hasGps = o['dropoff_lat'] != null && o['dropoff_lng'] != null;
    final small = OutlinedButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 14));
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: conectLavender, borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('CUSTOMER',
            style: TextStyle(fontSize: 11, letterSpacing: 1.5, fontWeight: FontWeight.w800, color: conectPurple)),
        const SizedBox(height: 4),
        Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: dark)),
        const SizedBox(height: 10),
        Row(children: [
          const Icon(Icons.phone_outlined, size: 18, color: conectPurple),
          const SizedBox(width: 8),
          Expanded(child: Text(phone.isEmpty ? 'No phone number given' : phone, style: const TextStyle(color: dark))),
          if (phone.isNotEmpty)
            OutlinedButton.icon(
              style: small,
              onPressed: () => _open('tel:${phone.replaceAll(RegExp(r'[^0-9+]'), '')}'),
              icon: const Icon(Icons.call, size: 18),
              label: const Text('Call'),
            ),
        ]),
        const SizedBox(height: 10),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.location_on_outlined, size: 18, color: conectPurple),
          const SizedBox(width: 8),
          Expanded(child: Text('${o['label']}: ${o['line1']}, ${o['city']}', style: const TextStyle(color: dark))),
          if (hasGps)
            OutlinedButton.icon(
              style: small,
              onPressed: () => _open(
                  'https://www.google.com/maps/dir/?api=1&destination=${o['dropoff_lat']},${o['dropoff_lng']}&travelmode=driving'),
              icon: const Icon(Icons.navigation_outlined, size: 18),
              label: const Text('Navigate'),
            ),
        ]),
        if (note.isNotEmpty) ...[
          const SizedBox(height: 10),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.sticky_note_2_outlined, size: 18, color: conectPurple),
            const SizedBox(width: 8),
            Expanded(child: Text(note, style: const TextStyle(color: dark, fontStyle: FontStyle.italic))),
          ]),
        ],
        const SizedBox(height: 10),
        const Text('The customer has a 4-digit PIN. Ask for it when you hand over the order.',
            style: TextStyle(fontSize: 12, color: dark)),
      ]),
    );
  }

  Widget _pill(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(color: color.withValues(alpha: .14), borderRadius: BorderRadius.circular(20)),
        child: Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
      );

  Widget _line(IconData icon, String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 18, color: conectPurple),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ]),
      );

  Widget _activeCard(Map<String, dynamic> o) {
    final status = o['status'].toString();
    final pickup = (o['pickup_address'] ?? '').toString().trim();
    final phone = (o['customer_phone'] ?? '').toString().trim();
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(o['store_name'], style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
            _pill(status.replaceAll('_', ' '), conectPurple),
          ]),
          const SizedBox(height: 4),
          Text(_stageText[status] ?? '', style: TextStyle(color: Theme.of(context).hintColor)),
          const SizedBox(height: 12),
          _line(Icons.storefront_outlined, pickup.isEmpty ? 'Pickup address not provided' : pickup),
          if (o['pickup_lat'] != null && o['pickup_lng'] != null)
            _line(Icons.my_location, '${o['pickup_lat']}, ${o['pickup_lng']}'),
                    _customerBlock(o),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: () => status == 'picked_up' ? confirmDelivery(o) : act('/courier/orders/${o['id']}/advance'),
            child: Text(_nextLabel[status] ?? 'Next'),
          ),
        ]),
      ),
    );
  }

  Widget _availableCard(Map<String, dynamic> o) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(o['store_name'], style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800))),
              _pill('₦${n(o['delivery_fee']).toStringAsFixed(0)}', conectOrange),
            ]),
            const SizedBox(height: 8),
            _line(Icons.storefront_outlined, 'Pick up: ${(o['pickup_address'] ?? o['store_name']).toString()}'),
            _line(Icons.location_on_outlined, 'Deliver: ${o['line1']}, ${o['city']}'),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => act('/courier/orders/${o['id']}/accept'), child: const Text('Accept order')),
          ]),
        ),
      );
}

class CourierOnboarding extends StatefulWidget {
  final Map<String, dynamic> profileData;
  final VoidCallback onSaved;
  const CourierOnboarding({super.key, required this.profileData, required this.onSaved});
  @override
  State<CourierOnboarding> createState() => _CourierOnboardingState();
}

class _CourierOnboardingState extends State<CourierOnboarding> {
  final phone = TextEditingController(), address = TextEditingController(), license = TextEditingController();
  String vehicle = 'motorcycle';
  bool saving = false;

  @override
  void initState() {
    super.initState();
    _fill();
  }

  @override
  void dispose() {
    phone.dispose();
    address.dispose();
    license.dispose();
    super.dispose();
  }

  void _fill() {
    final p = widget.profileData['profile'];
    if (p is Map) {
      phone.text = p['phone'] ?? '';
      address.text = p['address'] ?? '';
      license.text = p['license_number'] ?? '';
      vehicle = p['vehicle_type'] ?? 'motorcycle';
    }
  }

  @override
  void didUpdateWidget(covariant CourierOnboarding oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.profileData['profile'] == null && widget.profileData['profile'] != null) _fill();
  }

  void toast(String message) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

  Future<void> saveProfile() async {
    if (phone.text.trim().length < 7 || address.text.trim().length < 5) {
      return toast('Enter a valid phone number and home address.');
    }
    setState(() => saving = true);
    try {
      await api.put('/courier/profile', {
        'phone': phone.text.trim(),
        'address': address.text.trim(),
        'vehicle_type': vehicle,
        'license_number': license.text.trim(),
      });
      toast('Profile saved. Upload the required verification documents next.');
      widget.onSaved();
    } on ApiException catch (e) {
      toast(e.message);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> upload(String type) async {
    if (widget.profileData['profile'] == null) return toast('Save your courier profile first.');
    setState(() => saving = true);
    try {
      final result = await FilePicker.platform
          .pickFiles(type: FileType.custom, allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'], withData: true);
      if (result == null) return;
      final file = result.files.single;
      final bytes = file.bytes;
      if (bytes == null || bytes.isEmpty) throw ApiException('Could not read the selected file.');
      if (bytes.length > 2 * 1024 * 1024) throw ApiException('Choose a file no larger than 2 MB.');
      final ext = (file.extension ?? '').toLowerCase();
      final mime = ext == 'pdf' ? 'application/pdf' : ext == 'png' ? 'image/png' : 'image/jpeg';
      await api.post('/verification/documents',
          {'document_type': type, 'filename': file.name, 'mime_type': mime, 'data_base64': base64Encode(bytes)});
      toast('Document uploaded securely for review.');
      widget.onSaved();
    } on ApiException catch (e) {
      toast(e.message);
    } catch (e) {
      toast(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = widget.profileData['profile'];
    final docs = (widget.profileData['documents'] as List? ?? []).cast<Map<String, dynamic>>();
    final needsVehicleDocs = vehicle == 'motorcycle' || vehicle == 'car';
    return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
      const Text('Complete courier verification', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
      const SizedBox(height: 4),
      Text('You can’t receive delivery jobs until your profile, required documents and in-person orientation are approved.',
          style: TextStyle(color: Theme.of(context).hintColor)),
      const SizedBox(height: 16),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone number')),
            const SizedBox(height: 12),
            TextField(controller: address, minLines: 2, maxLines: 3, decoration: const InputDecoration(labelText: 'Home address')),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: vehicle,
              decoration: const InputDecoration(labelText: 'Delivery vehicle'),
              items: const [
                DropdownMenuItem(value: 'bicycle', child: Text('Bicycle')),
                DropdownMenuItem(value: 'motorcycle', child: Text('Motorcycle')),
                DropdownMenuItem(value: 'car', child: Text('Car')),
                DropdownMenuItem(value: 'other', child: Text('Other')),
              ],
              onChanged: (v) => setState(() => vehicle = v ?? 'motorcycle'),
            ),
            const SizedBox(height: 12),
            TextField(controller: license, decoration: const InputDecoration(labelText: 'Driving licence number (if applicable)')),
            const SizedBox(height: 16),
            FilledButton(onPressed: saving ? null : saveProfile, child: Text(saving ? 'Please wait…' : 'Save courier profile')),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Verification documents', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
            const SizedBox(height: 4),
            const Text('JPG, PNG or PDF, up to 2 MB each.'),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              OutlinedButton.icon(
                  onPressed: saving ? null : () => upload('government_id'),
                  icon: const Icon(Icons.badge_outlined),
                  label: const Text('Government ID')),
              if (needsVehicleDocs)
                OutlinedButton.icon(
                    onPressed: saving ? null : () => upload('driving_license'),
                    icon: const Icon(Icons.credit_card),
                    label: const Text('Driving licence')),
              if (needsVehicleDocs)
                OutlinedButton.icon(
                    onPressed: saving ? null : () => upload('vehicle_registration'),
                    icon: const Icon(Icons.directions_bike),
                    label: const Text('Vehicle registration')),
            ]),
            if (profile == null) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Save your profile before uploading documents.')),
            for (final d in docs)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.description_outlined, color: conectPurple),
                title: Text(d['document_type'].toString().replaceAll('_', ' ')),
                subtitle: Text('${d['filename']} · ${d['review_status']}'),
              ),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      OutlinedButton.icon(onPressed: widget.onSaved, icon: const Icon(Icons.refresh), label: const Text('Refresh verification status')),
    ]);
  }
}
