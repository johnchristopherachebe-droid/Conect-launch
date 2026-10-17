import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';
import 'tracking.dart';
import 'delivery_contact.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});
  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  late Future<dynamic> addresses = context.read<AppState>().api.get('/addresses');
  String? addressId;
  num? quotedFee;
  bool busy = false, quoteLoading = false;
  String? quoteError;
  final phoneCtl = TextEditingController(), noteCtl = TextEditingController();

  Future<void> quoteFor(String id) async {
    setState(() { quoteLoading = true; quotedFee = null; quoteError = null; });
    try {
      final st = context.read<AppState>().store;
      if (st == null) throw ApiException('Your cart has no selected store.');
      final r = await context.read<AppState>().api.get('/delivery/quote?storeId=${st['id']}&addressId=${Uri.encodeComponent(id)}');
      if (mounted) setState(() { quotedFee = n(r['deliveryFee']); quoteError = null; });
    } on ApiException catch (e) { if (mounted) setState(() { quoteError = e.message; quotedFee = null; }); }
    finally { if (mounted) setState(() => quoteLoading = false); }
  }

  Future<void> newAddress() async {
    final label = TextEditingController(text: 'Home'), line = TextEditingController(), city = TextEditingController();
    double? lat, lng;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('New address'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: label, decoration: const InputDecoration(labelText: 'Label')),
          TextField(controller: line, decoration: const InputDecoration(labelText: 'Street and number')),
          TextField(controller: city, decoration: const InputDecoration(labelText: 'City')),
          StatefulBuilder(
            builder: (ctx, set) => TextButton.icon(
              icon: Icon(lat == null ? Icons.my_location : Icons.check_circle),
              label: Text(lat == null ? 'Use my current location' : 'Location saved'),
              onPressed: () async {
                try {
                  var perm = await Geolocator.checkPermission();
                  if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
                  if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return;
                  final p = await Geolocator.getCurrentPosition();
                  lat = p.latitude;
                  lng = p.longitude;
                  set(() {});
                } catch (_) {}
              },
            ),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save address')),
        ],
      ),
    );
    if (ok != true) return;
    if (line.text.trim().isEmpty || city.text.trim().isEmpty) return toast('Enter your street address and city.');
    if (lat == null || lng == null) return toast('Tap “Use my current location” before saving so delivery coverage can be checked.');
    try {
      final a = await context.read<AppState>().api.post('/addresses',
          {'label': label.text.trim(), 'line1': line.text.trim(), 'city': city.text.trim(), if (lat != null) ...{'lat': lat, 'lng': lng}});
      addressId = a['id'];
      setState(() => addresses = context.read<AppState>().api.get('/addresses'));
      await quoteFor(addressId!);
    } on ApiException catch (e) {
      toast(e.message);
    }
  }

  void toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> place() async {
    if (addressId == null) return toast('Choose a delivery address first');
    if (quotedFee == null || quoteError != null || quoteLoading) return toast('Confirm delivery coverage with a GPS-enabled address before placing the order.');
        final phone = phoneCtl.text.trim();
    if (phone.replaceAll(RegExp(r'\D'), '').length < 7) return toast('Enter a phone number your rider can call.');
    setState(() => busy = true);
    try {
      final o = await context.read<AppState>().placeOrder(addressId!);
      final client = context.read<AppState>().api;
      try { await client.post('/me/phone', {'phone': phone}); } catch (_) {}
      if (noteCtl.text.trim().isNotEmpty) {
        try { await client.post('/orders/${o['id']}/delivery-note', {'note': noteCtl.text.trim()}); } catch (_) {}
      }
      try {
        await context.read<AppState>().startPayment(o['id']);
      } catch (_) {
        toast('Order saved. Tap Pay now on the next screen to finish paying.');
      }
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => TrackingScreen(orderId: o['id'])));
    } on ApiException catch (e) {
      toast(e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(title: const Text('Your cart')),
      body: s.cart.isEmpty
          ? const Center(child: Text('Your cart is empty. Pick a store to start.'))
          : ListView(padding: const EdgeInsets.all(16), children: [
              for (final l in s.cart.values)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${l.qty} × ${l.name}'),
                  trailing: Text('₦${(l.price * l.qty).toStringAsFixed(0)}'),
                ),
              const Divider(),
              _row('Delivery', quotedFee ?? s.fee),
              _row('Total', s.subtotal + (quotedFee ?? s.fee), bold: true),
      DeliveryContactCard(phone: phoneCtl, note: noteCtl),
      const SizedBox(height: 12),
              const SizedBox(height: 16),
              Text('Deliver to', style: Theme.of(context).textTheme.titleMedium),
              FutureBuilder(
                future: addresses,
                builder: (_, snap) {
                  if (snap.hasError) {
                    return Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('Could not load your saved addresses.'),
                        TextButton(onPressed: () => setState(() => addresses = context.read<AppState>().api.get('/addresses')), child: const Text('Try again')),
                      ]),
                    );
                  }
                  if (!snap.hasData) return const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator());
                  final list = (snap.data as List).cast<Map<String, dynamic>>();
                  return Column(children: [
                    RadioGroup<String>(
                      groupValue: addressId,
                      onChanged: (v) { setState(() { addressId = v; quotedFee = null; quoteError = null; }); if (v != null) quoteFor(v); },
                      child: Column(children: [
                        for (final a in list)
                          RadioListTile<String>(value: a['id'], title: Text(a['label']), subtitle: Text('${a['line1']}, ${a['city']}')),
                      ]),
                    ),
                    if (quoteLoading) const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator()),
                    if (quoteError != null) Padding(padding: const EdgeInsets.all(8), child: Text(quoteError!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                    Align(alignment: Alignment.centerLeft,
                        child: TextButton.icon(onPressed: newAddress, icon: const Icon(Icons.add), label: const Text('Add an address'))),
                  ]);
                },
              ),
            ]),
      bottomNavigationBar: s.cart.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton(
                  style: FilledButton.styleFrom(padding: const EdgeInsets.all(16)),
                  onPressed: busy || quoteLoading || addressId == null || quotedFee == null || quoteError != null ? null : place,
                  child: Text(busy ? 'Please wait…' : quoteLoading ? 'Checking delivery…' : quotedFee == null ? 'Select a GPS-enabled address' : 'Place order · ₦${(s.subtotal + quotedFee!).toStringAsFixed(0)}'),
                ),
              ),
            ),
    );
  }

  Widget _row(String l, num v, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(l, style: TextStyle(fontWeight: bold ? FontWeight.w800 : null)),
          Text('₦${v.toStringAsFixed(0)}', style: TextStyle(fontWeight: bold ? FontWeight.w800 : null)),
        ]),
      );
}
