import 'dart:async';
import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'api.dart';
import 'main.dart' show api;
import 'push.dart';

const _nextLabel = {
  'ready': 'Picked up',
  'picked_up': 'Delivered',
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
        setState(() { active = []; available = []; loading = false; error = null; });
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
      setState(() { error = e.message; loading = false; });
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

  Future<void> act(String path) async {
    try {
      await api.post(path);
      await refresh();
      sendLocation();
    } on ApiException catch (e) {
      toast(e.message);
      refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cönëct Courier', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: widget.onSignOut)],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : profileData == null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [Text(error ?? 'Could not load your courier profile.'), const SizedBox(height: 12), FilledButton(onPressed: refresh, child: const Text('Try again'))])))
              : profileData!['approved'] != true
                  ? CourierOnboarding(profileData: profileData!, onSaved: () { refresh(); })
                  : RefreshIndicator(
              onRefresh: refresh,
              child: ListView(padding: const EdgeInsets.all(16), children: [
                if (error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Available for orders', style: TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: const Text('Shares your location so nearby orders can be offered to you.'),
                  value: online,
                  onChanged: (v) {
                    setState(() => online = v);
                    if (v) sendLocation();
                  },
                ),
                const SizedBox(height: 8),
                Text('Your deliveries', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                if (active.isEmpty) const Text('Nothing in progress. Accept an order below.'),
                for (final o in active)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(o['store_name'], style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        if ((o['pickup_address'] ?? '').toString().trim().isNotEmpty)
                          Text('Pick up from: ${o['pickup_address']}'),
                        if (o['pickup_lat'] != null && o['pickup_lng'] != null)
                          Text('Pickup GPS: ${o['pickup_lat']}, ${o['pickup_lng']}'),
                        Text('Deliver to ${o['label']}: ${o['line1']}, ${o['city']}'),
                        Text('Customer phone: ${(o['customer_phone'] ?? '').toString().trim().isEmpty ? 'Not provided' : o['customer_phone']}'),
                        Text('Status: ${o['status'].toString().replaceAll('_', ' ')}'),
                        const SizedBox(height: 12),
                        FilledButton(onPressed: () => act('/courier/orders/${o['id']}/advance'), child: Text(_nextLabel[o['status']] ?? 'Next')),
                      ]),
                    ),
                  ),
                const SizedBox(height: 24),
                Text('Available orders', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                if (available.isEmpty) const Text('No orders waiting. This list refreshes by itself.'),
                for (final o in available)
                  Card(
                    child: ListTile(
                      title: Text(o['store_name'], style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text('Pick up: ${(o['pickup_address'] ?? o['store_name']).toString()} · Deliver: ${o['line1']}, ${o['city']} · fee ₦${n(o['delivery_fee']).toStringAsFixed(0)}'),
                      trailing: FilledButton.tonal(onPressed: () => act('/courier/orders/${o['id']}/accept'), child: const Text('Accept')),
                    ),
                  ),
              ]),
            ),
    );
  }
}


class CourierOnboarding extends StatefulWidget {
  final Map<String, dynamic> profileData;
  final VoidCallback onSaved;
  const CourierOnboarding({super.key, required this.profileData, required this.onSaved});
  @override State<CourierOnboarding> createState() => _CourierOnboardingState();
}
class _CourierOnboardingState extends State<CourierOnboarding> {
  final phone = TextEditingController(), address = TextEditingController(), license = TextEditingController();
  String vehicle = 'motorcycle'; bool saving = false;
  @override void initState() { super.initState(); _fill(); }
  void _fill() { final p=widget.profileData['profile']; if(p is Map) { phone.text=p['phone']??''; address.text=p['address']??''; license.text=p['license_number']??''; vehicle=p['vehicle_type']??'motorcycle'; } }
  @override void didUpdateWidget(covariant CourierOnboarding oldWidget) { super.didUpdateWidget(oldWidget); if(oldWidget.profileData['profile'] == null && widget.profileData['profile'] != null) _fill(); }
  void toast(String message) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  Future<void> saveProfile() async {
    if(phone.text.trim().length<7 || address.text.trim().length<5) return toast('Enter a valid phone number and home address.');
    setState(()=>saving=true);
    try { await api.put('/courier/profile', {'phone':phone.text.trim(),'address':address.text.trim(),'vehicle_type':vehicle,'license_number':license.text.trim()}); toast('Profile saved. Upload the required verification documents next.'); widget.onSaved(); }
    on ApiException catch(e) { toast(e.message); } finally { if(mounted)setState(()=>saving=false); }
  }
  Future<void> upload(String type) async {
    if(widget.profileData['profile']==null) return toast('Save your courier profile first.');
    setState(()=>saving=true);
    try {
      final result=await FilePicker.platform.pickFiles(type:FileType.custom,allowedExtensions:['jpg','jpeg','png','pdf'],withData:true);
      if(result==null)return; final file=result.files.single; final bytes=file.bytes;
      if(bytes==null||bytes.isEmpty)throw ApiException('Could not read the selected file.');
      if(bytes.length>2*1024*1024)throw ApiException('Choose a file no larger than 2 MB.');
      final ext=(file.extension??'').toLowerCase(); final mime=ext=='pdf'?'application/pdf':ext=='png'?'image/png':'image/jpeg';
      await api.post('/verification/documents',{'document_type':type,'filename':file.name,'mime_type':mime,'data_base64':base64Encode(bytes)});
      toast('Document uploaded securely for review.'); widget.onSaved();
    } on ApiException catch(e) { toast(e.message); } catch(e) { toast(e.toString().replaceFirst('Exception: ','')); } finally { if(mounted)setState(()=>saving=false); }
  }
  @override Widget build(BuildContext context) {
    final profile=widget.profileData['profile']; final docs=(widget.profileData['documents'] as List? ?? []).cast<Map<String,dynamic>>();
    return ListView(padding:const EdgeInsets.all(16),children:[
      const Icon(Icons.delivery_dining,size:52), const SizedBox(height:8), const Text('Complete courier verification',style:TextStyle(fontSize:22,fontWeight:FontWeight.bold)),
      const Text('You cannot receive delivery jobs until your profile, required documents and in-person orientation are approved.'),
      const SizedBox(height:16), Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        TextField(controller:phone,keyboardType:TextInputType.phone,decoration:const InputDecoration(labelText:'Phone number')),
        TextField(controller:address,minLines:2,maxLines:3,decoration:const InputDecoration(labelText:'Home address')),
        DropdownButtonFormField<String>(value:vehicle,decoration:const InputDecoration(labelText:'Delivery vehicle'),items:const [DropdownMenuItem(value:'bicycle',child:Text('Bicycle')),DropdownMenuItem(value:'motorcycle',child:Text('Motorcycle')),DropdownMenuItem(value:'car',child:Text('Car')),DropdownMenuItem(value:'other',child:Text('Other'))],onChanged:(v)=>setState(()=>vehicle=v??'motorcycle')),
        TextField(controller:license,decoration:const InputDecoration(labelText:'Driving licence number (if applicable)')),
        const SizedBox(height:12),FilledButton(onPressed:saving?null:saveProfile,child:Text(saving?'Please wait…':'Save courier profile')),
      ]))),
      const SizedBox(height:12), const Text('Verification documents · JPG, PNG or PDF · 2 MB maximum',style:TextStyle(fontWeight:FontWeight.bold)),
      Wrap(spacing:8,runSpacing:8,children:[OutlinedButton.icon(onPressed:saving?null:()=>upload('government_id'),icon:const Icon(Icons.badge_outlined),label:const Text('Government ID')),if(vehicle=='motorcycle'||vehicle=='car')OutlinedButton.icon(onPressed:saving?null:()=>upload('driving_license'),icon:const Icon(Icons.credit_card),label:const Text('Driving licence')),if(vehicle=='motorcycle'||vehicle=='car')OutlinedButton.icon(onPressed:saving?null:()=>upload('vehicle_registration'),icon:const Icon(Icons.directions_bike),label:const Text('Vehicle registration'))]),
      if(profile==null)const Text('Save your profile before uploading documents.'),
      ...docs.map((d)=>ListTile(dense:true,leading:const Icon(Icons.description_outlined),title:Text(d['document_type'].toString().replaceAll('_',' ')),subtitle:Text('${d['filename']} · ${d['review_status']}'))),
      const SizedBox(height:8),OutlinedButton.icon(onPressed:widget.onSaved,icon:const Icon(Icons.refresh),label:const Text('Refresh verification status')),
    ]);
  }
}
