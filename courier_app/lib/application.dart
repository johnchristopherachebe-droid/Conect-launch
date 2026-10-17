import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;
import 'api.dart';
import 'brand.dart';
import 'main.dart' show api;

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

/// Guided verification for riders. Shown inside the Jobs screen until the rider is approved.
class CourierApplication extends StatefulWidget {
  final Map<String, dynamic> profileData;
  final VoidCallback onSaved;
  const CourierApplication({super.key, required this.profileData, required this.onSaved});
  @override
  State<CourierApplication> createState() => _CourierApplicationState();
}

class _CourierApplicationState extends State<CourierApplication> {
  final phone = TextEditingController(), address = TextEditingController(), license = TextEditingController();
  String vehicle = 'motorcycle';
  bool busy = false;
  int? open; // null = open the first unfinished step automatically, -1 = all closed

  Map? get profile => widget.profileData['profile'] is Map ? widget.profileData['profile'] as Map : null;
  List get documents => (widget.profileData['documents'] as List?) ?? const [];

  @override
  void initState() {
    super.initState();
    _fill();
  }

  @override
  void didUpdateWidget(covariant CourierApplication oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.profileData['profile'] == null && widget.profileData['profile'] != null) _fill();
  }

  @override
  void dispose() {
    phone.dispose();
    address.dispose();
    license.dispose();
    super.dispose();
  }

  void _fill() {
    final p = profile;
    if (p == null) return;
    phone.text = (p['phone'] ?? '').toString();
    address.text = (p['address'] ?? '').toString();
    license.text = (p['license_number'] ?? '').toString();
    final v = p['vehicle_type'];
    vehicle = ['bicycle', 'motorcycle', 'car', 'other'].contains(v) ? v as String : 'motorcycle';
  }

  void _toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  bool get _motor => ['motorcycle', 'car'].contains((profile?['vehicle_type'] ?? vehicle).toString());

  String _docState(String type) {
    final p = profile;
    if (p == null) return 'not_submitted';
    const keys = {
      'government_id': 'government_id_status',
      'driving_license': 'driving_license_status',
      'vehicle_registration': 'vehicle_registration_status',
    };
    return (p[keys[type]] ?? 'not_submitted').toString();
  }

  bool get _docsDone =>
      _docState('government_id') == 'approved' &&
      (!_motor || (_docState('driving_license') == 'approved' && _docState('vehicle_registration') == 'approved'));

  List<bool> get _done => [profile != null, _docsDone, profile?['orientation_completed'] == true];
  int get _firstIncomplete => _done.indexOf(false);

  Future<void> _run(Future<void> Function() fn) async {
    setState(() => busy = true);
    try {
      await fn();
      widget.onSaved();
      if (mounted) setState(() => open = null);
    } on ApiException catch (e) {
      _toast(e.message);
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _saveProfile() async {
    if (phone.text.trim().length < 7 || address.text.trim().length < 5) {
      return _toast('Enter a valid phone number and home address.');
    }
    await _run(() async {
      await api.put('/courier/profile', {
        'phone': phone.text.trim(),
        'address': address.text.trim(),
        'vehicle_type': vehicle,
        'license_number': license.text.trim(),
      });
      _toast('Profile saved.');
    });
  }

  Future<void> _upload(String type) async {
    if (profile == null) return _toast('Save your rider profile first.');
    try {
      final result = await FilePicker.platform
          .pickFiles(type: FileType.custom, allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'], withData: true);
      if (result == null) return;
      final file = result.files.single;
      final raw = file.bytes;
      if (raw == null || raw.isEmpty) throw ApiException('Could not read the selected file.');
      var bytes = raw;
      final ext = (file.extension ?? '').toLowerCase();
      var mime = ext == 'pdf' ? 'application/pdf' : ext == 'png' ? 'image/png' : 'image/jpeg';
      var fileName = file.name;
      setState(() => busy = true);
      if (mime != 'application/pdf' && bytes.length > 1500 * 1024) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        final decoded = img.decodeImage(bytes);
        if (decoded == null) throw ApiException('That image could not be read. Try another photo.');
        var up = img.bakeOrientation(decoded);
        if (up.width > 1600 || up.height > 1600) {
          up = up.width >= up.height ? img.copyResize(up, width: 1600) : img.copyResize(up, height: 1600);
        }
        bytes = img.encodeJpg(up, quality: 85);
        mime = 'image/jpeg';
        fileName = '${fileName.replaceAll(RegExp(r'\.[^.]+$'), '')}.jpg';
      }
      if (bytes.length > 2 * 1024 * 1024) throw ApiException('Choose a file no larger than 2 MB.');
      await api.post('/verification/documents',
          {'document_type': type, 'filename': fileName, 'mime_type': mime, 'data_base64': base64Encode(bytes)});
      _toast('Document submitted securely for review.');
      widget.onSaved();
      if (mounted) setState(() => open = null);
    } on ApiException catch (e) {
      _toast(e.message);
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
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
        TextField(controller: license, decoration: const InputDecoration(labelText: 'Driving licence number (if you have one)')),
        const SizedBox(height: 6),
        Text('Save your profile to update which documents your vehicle needs.',
            style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor)),
        const SizedBox(height: 10),
        FilledButton(onPressed: busy ? null : _saveProfile, child: Text(profile == null ? 'Save rider profile' : 'Update profile')),
      ]);

  Widget _docRow(String type, String label) {
    final status = _docState(type);
    final (text, color) = _docStatus(status);
    final files = documents.cast<Map>().where((d) => d['document_type'] == type).toList();
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
          const Padding(padding: EdgeInsets.only(top: 8), child: Text('Save your rider profile first (step 1).')),
        _docRow('government_id', 'Government ID'),
        if (_motor) _docRow('driving_license', 'Driving licence'),
        if (_motor) _docRow('vehicle_registration', 'Vehicle registration'),
        Text('Our team checks each file. If one is rejected, upload a clearer copy.',
            style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor)),
      ]);

  Widget _orientationBody() {
    final done = profile?['orientation_completed'] == true;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _chip(done ? 'Complete' : 'Pending', done ? const Color(0xFF16A34A) : conectOrange),
      const SizedBox(height: 8),
      const Text('Every rider completes a short orientation with our team in person before approval. '
          'Our team marks it complete after meeting you.'),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final done = _done;
    final count = done.where((d) => d).length;
    final note = (profile?['review_notes'] ?? '').toString().trim();
    return RefreshIndicator(
      onRefresh: () async {
        widget.onSaved();
        await Future<void>.delayed(const Duration(milliseconds: 600));
      },
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
        if (busy) const Padding(padding: EdgeInsets.only(bottom: 12), child: LinearProgressIndicator()),
        Text('Get verified to start delivering', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text(
          count == 3
              ? 'All steps are complete. Our team is reviewing your application and will approve you.'
              : '$count of 3 steps complete. This page updates by itself.',
          style: TextStyle(color: Theme.of(context).hintColor),
        ),
        const SizedBox(height: 10),
        LinearProgressIndicator(value: count / 3, minHeight: 8, borderRadius: BorderRadius.circular(8)),
        const SizedBox(height: 16),
        if (note.isNotEmpty)
          Card(
            color: conectLavender,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Note from the Cönëct team', style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF2A0F55))),
                const SizedBox(height: 4),
                Text(note, style: const TextStyle(color: Color(0xFF2A0F55))),
              ]),
            ),
          ),
        _step(0, 'Rider profile', profile == null ? 'Tell us about you and your vehicle' : 'Saved', done[0], _profileBody()),
        _step(1, 'Documents', _docsDone ? 'All approved' : 'ID: ${_docStatus(_docState('government_id')).$1}', done[1], _docsBody()),
        _step(2, 'In-person orientation', done[2] ? 'Complete' : 'Pending', done[2], _orientationBody()),
      ]),
    );
  }
}
