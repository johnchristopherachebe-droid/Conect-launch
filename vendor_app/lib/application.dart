import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image/image.dart' as img;
import 'brand.dart';
import 'main.dart' show Api, cleanError;

(String, Color) _docStatus(String s) {
  switch (s) {
    case 'approved':
      return ('Approved', const Color(0xFF16A34A));
    case 'submitted':
      return ('Under review', conectPurple);
    case 'rejected':
      return ('Rejected: upload a clearer copy', const Color(0xFFDC2626));
    default:
      return ('Not uploaded', const Color(0xFF6B6280));
  }
}

class VendorApplication extends StatefulWidget {
  final Api api;
  final Map<String, dynamic> data;
  final List documents;
  final VoidCallback onChanged, onSignOut;
  const VendorApplication({
    super.key,
    required this.api,
    required this.data,
    required this.documents,
    required this.onChanged,
    required this.onSignOut,
  });
  @override
  State<VendorApplication> createState() => _VendorApplicationState();
}

class _VendorApplicationState extends State<VendorApplication> {
  final name = TextEditingController(), phone = TextEditingController(), address = TextEditingController(), reg = TextEditingController();
  String bizType = 'food';
  double? lat, lng;
  bool busy = false;
  int? open; // null = open the first unfinished step automatically, -1 = all closed

  Map? get profile => widget.data['profile'] is Map ? widget.data['profile'] as Map : null;
  Map? get store => widget.data['store'] is Map ? widget.data['store'] as Map : null;

  @override
  void initState() {
    super.initState();
    _fill();
  }

  @override
  void didUpdateWidget(covariant VendorApplication oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.data['profile'] == null && widget.data['profile'] != null) _fill();
  }

  @override
  void dispose() {
    for (final c in [name, phone, address, reg]) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill() {
    final p = profile;
    if (p == null) return;
    name.text = (p['business_name'] ?? '').toString();
    phone.text = (p['phone'] ?? '').toString();
    address.text = (p['address'] ?? '').toString();
    reg.text = (p['registration_number'] ?? '').toString();
    final t = p['business_type'];
    bizType = ['food', 'groceries', 'pharmacy'].contains(t) ? t as String : 'food';
  }

  void _toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  bool get _isFood => (profile?['business_type'] ?? 'food') == 'food';

  String _docState(String type) {
    final p = profile;
    if (p == null) return 'not_submitted';
    final v = type == 'government_id' ? p['government_id_status'] : p['food_safety_status'];
    return (v ?? 'not_submitted').toString();
  }

  bool get _docsDone => _docState('government_id') == 'approved' && (!_isFood || _docState('food_safety') == 'approved');
  List<bool> get _done => [profile != null, store != null, _docsDone, profile?['orientation_completed'] == true];
  int get _firstIncomplete => _done.indexOf(false);

  Future<void> _run(Future<void> Function() fn) async {
    setState(() => busy = true);
    try {
      await fn();
      widget.onChanged();
      if (mounted) setState(() => open = null);
    } catch (e) {
      _toast(cleanError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _saveProfile() async {
    if (name.text.trim().length < 2 || address.text.trim().length < 5) {
      return _toast('Enter your business name and address.');
    }
    await _run(() async {
      await widget.api.send('PUT', '/vendor/profile', {
        'business_name': name.text.trim(),
        'business_type': bizType,
        'phone': phone.text.trim(),
        'address': address.text.trim(),
        'registration_number': reg.text.trim(),
      });
      _toast('Business profile saved.');
    });
  }

  Future<void> _capture() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        throw Exception('Location permission is required to register your store.');
      }
      final p = await Geolocator.getCurrentPosition();
      if (mounted) {
        setState(() {
          lat = p.latitude;
          lng = p.longitude;
        });
      }
      _toast('Store location captured.');
    } catch (e) {
      _toast(cleanError(e));
    }
  }

  Future<void> _createStore() async {
    if (lat == null || lng == null) return _toast('Capture your store location first.');
    await _run(() async {
      await widget.api.send('POST', '/vendor/store', {'lat': lat, 'lng': lng, 'delivery_fee': 300});
      _toast('Store created. It stays closed until you are approved.');
    });
  }

  Future<void> _upload(String type) async {
    try {
      final result = await FilePicker.platform
          .pickFiles(type: FileType.custom, allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'], withData: true);
      if (result == null) return;
      final file = result.files.single;
      final raw = file.bytes;
      if (raw == null || raw.isEmpty) throw Exception('Could not read the selected file.');
      var bytes = raw;
      final ext = (file.extension ?? '').toLowerCase();
      var mime = ext == 'pdf' ? 'application/pdf' : ext == 'png' ? 'image/png' : 'image/jpeg';
      var fileName = file.name;
      setState(() => busy = true);
      if (mime != 'application/pdf' && bytes.length > 1500 * 1024) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        final decoded = img.decodeImage(bytes);
        if (decoded == null) throw Exception('That image could not be read. Try another photo.');
        var up = img.bakeOrientation(decoded);
        if (up.width > 1600 || up.height > 1600) {
          up = up.width >= up.height ? img.copyResize(up, width: 1600) : img.copyResize(up, height: 1600);
        }
        bytes = img.encodeJpg(up, quality: 85);
        mime = 'image/jpeg';
        fileName = '${fileName.replaceAll(RegExp(r'\.[^.]+$'), '')}.jpg';
      }
      if (bytes.length > 2 * 1024 * 1024) throw Exception('Choose a file no larger than 2 MB.');
      await widget.api.send('POST', '/verification/documents',
          {'document_type': type, 'filename': fileName, 'mime_type': mime, 'data_base64': base64Encode(bytes)});
      _toast('Document submitted securely for review.');
      widget.onChanged();
      if (mounted) setState(() => open = null);
    } catch (e) {
      _toast(cleanError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _chip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(color: color.withValues(alpha: .14), borderRadius: BorderRadius.circular(20)),
        child: Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
      );

  Widget _step(int i, String title, String summary, bool done, Widget body) {
    final isOpen = (open ?? _firstIncomplete) == i;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(children: [
        InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => setState(() => open = isOpen ? -1 : i),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              CircleAvatar(
                radius: 16,
                backgroundColor: done ? const Color(0xFF16A34A) : conectLavender,
                child: done
                    ? const Icon(Icons.check, size: 18, color: Colors.white)
                    : Text('${i + 1}', style: const TextStyle(color: conectPurple, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  Text(summary, style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor)),
                ]),
              ),
              Icon(isOpen ? Icons.expand_less_rounded : Icons.expand_more_rounded),
            ]),
          ),
        ),
        if (isOpen) Padding(padding: const EdgeInsets.fromLTRB(14, 0, 14, 14), child: body),
      ]),
    );
  }

  Widget _profileBody() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextField(controller: name, decoration: const InputDecoration(labelText: 'Business name')),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: bizType,
          items: const [
            DropdownMenuItem(value: 'food', child: Text('Food / pastries')),
            DropdownMenuItem(value: 'groceries', child: Text('Groceries')),
            DropdownMenuItem(value: 'pharmacy', child: Text('Pharmacy')),
          ],
          onChanged: (v) => setState(() => bizType = v ?? 'food'),
          decoration: const InputDecoration(labelText: 'Business type'),
        ),
        const SizedBox(height: 12),
        TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Business phone')),
        const SizedBox(height: 12),
        TextField(controller: address, decoration: const InputDecoration(labelText: 'Business address')),
        const SizedBox(height: 12),
        TextField(controller: reg, decoration: const InputDecoration(labelText: 'Registration number (if you have one)')),
        const SizedBox(height: 14),
        FilledButton(onPressed: busy ? null : _saveProfile, child: Text(profile == null ? 'Save business profile' : 'Update profile')),
      ]);

  Widget _storeBody() {
    if (profile == null) return const Text('Complete step 1 first.');
    final s = store;
    if (s != null) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${s['name'] ?? 'Your store'}', style: const TextStyle(fontWeight: FontWeight.w800)),
        Text('GPS: ${s['lat']}, ${s['lng']}'),
        const SizedBox(height: 4),
        Text('Your store stays closed to customers until you are approved.', style: TextStyle(color: Theme.of(context).hintColor)),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('Stand at your store, then capture its GPS location so nearby customers can find you.'),
      const SizedBox(height: 12),
      OutlinedButton.icon(
        onPressed: busy ? null : _capture,
        icon: Icon(lat == null ? Icons.my_location : Icons.check_circle),
        label: Text(lat == null ? 'Capture store location' : 'Location captured'),
      ),
      if (lat != null)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text('GPS: ${lat!.toStringAsFixed(5)}, ${lng!.toStringAsFixed(5)}', textAlign: TextAlign.center),
        ),
      const SizedBox(height: 10),
      FilledButton(onPressed: busy ? null : _createStore, child: const Text('Create my store')),
    ]);
  }

  Widget _docRow(String type, String label) {
    final status = _docState(type);
    final (text, color) = _docStatus(status);
    final files = widget.documents.cast<Map>().where((d) => d['document_type'] == type).toList();
    final fname = files.isEmpty ? null : files.first['filename'].toString();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700))),
          _chip(text, color),
        ]),
        if (fname != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(fname, style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor)),
          ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: (busy || profile == null || status == 'approved') ? null : () => _upload(type),
          icon: Icon(status == 'not_submitted' ? Icons.upload_file : Icons.autorenew),
          label: Text(status == 'not_submitted' ? 'Upload' : 'Replace file'),
        ),
      ]),
    );
  }

  Widget _docsBody() => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('JPG, PNG or PDF. Photos are shrunk automatically; PDFs must be under 2 MB.',
            style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor)),
        if (profile == null)
          const Padding(padding: EdgeInsets.only(top: 8), child: Text('Save your business profile first (step 1).')),
        _docRow('government_id', 'Government ID'),
        if (_isFood) _docRow('food_safety', 'Food safety approval'),
        Text('Our team checks each file. If one is rejected, upload a clearer copy.',
            style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor)),
      ]);

  Widget _orientationBody() {
    final done = profile?['orientation_completed'] == true;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _chip(done ? 'Complete' : 'Pending', done ? const Color(0xFF16A34A) : conectOrange),
      const SizedBox(height: 8),
      const Text('Every vendor completes a short orientation with our team in person before approval. '
          'Our team marks it complete after meeting you.'),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final done = _done;
    final count = done.where((d) => d).length;
    final note = (profile?['review_notes'] ?? '').toString().trim();
    final gov = _docStatus(_docState('government_id')).$1;
    return GradientPage(
      title: 'Get verified',
      subtitle: '$count of 4 steps complete',
      actions: [IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout, color: Colors.white), onPressed: widget.onSignOut)],
      child: RefreshIndicator(
        onRefresh: () async {
          widget.onChanged();
          await Future<void>.delayed(const Duration(milliseconds: 600));
        },
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
          if (busy) const Padding(padding: EdgeInsets.only(bottom: 12), child: LinearProgressIndicator()),
          LinearProgressIndicator(value: count / 4, minHeight: 8, borderRadius: BorderRadius.circular(8)),
          const SizedBox(height: 14),
          Text(
            count == 4
                ? 'All steps are complete. Our team is reviewing your application and will approve your store.'
                : 'Complete these steps and our team will review your application. This page updates by itself.',
            style: TextStyle(color: Theme.of(context).hintColor),
          ),
          const SizedBox(height: 14),
          if (note.isNotEmpty)
            Card(
              color: conectLavender,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Note from the Cönëct team',
                      style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF2A0F55))),
                  const SizedBox(height: 4),
                  Text(note, style: const TextStyle(color: Color(0xFF2A0F55))),
                ]),
              ),
            ),
          _step(0, 'Business profile', profile == null ? 'Tell us about your business' : 'Saved', done[0], _profileBody()),
          _step(1, 'Store location', store == null ? 'Capture where your store is' : 'Store created', done[1], _storeBody()),
          _step(2, 'Documents', _docsDone ? 'All approved' : 'ID: $gov', done[2], _docsBody()),
          _step(3, 'In-person orientation', done[3] ? 'Complete' : 'Pending', done[3], _orientationBody()),
        ]),
      ),
    );
  }
}
