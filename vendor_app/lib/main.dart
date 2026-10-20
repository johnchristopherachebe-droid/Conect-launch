import 'dart:async';
import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'brand.dart';
import 'package:image/image.dart' as img;
import 'application.dart';
import 'category_picker.dart';
import 'onboarding.dart';
import 'wallet.dart';


final String apiUrl =
    const String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000').replaceAll(RegExp(r'/+$'), '');

String cleanError(Object e) => e.toString().replaceFirst('Exception: ', '').replaceFirst('ApiException: ', '');
num n(dynamic v) => v is num ? v : (num.tryParse('$v') ?? 0);
String naira(dynamic v) => '₦${n(v).toStringAsFixed(0)}';

class Api {
  String? token;
  Future<dynamic> send(String method, String path, [Object? body]) async {
    final req = http.Request(method, Uri.parse('$apiUrl$path'))..headers['Content-Type'] = 'application/json';
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    if (body != null) req.body = jsonEncode(body);
    final res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 15)));
    final data = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 400) {
      throw Exception((data is Map ? data['error'] : null) ?? 'Request failed (${res.statusCode})');
    }
    return data;
  }
}

void main() => runApp(const VendorApp());

class VendorApp extends StatelessWidget {
  const VendorApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Cönëct Vendor',
        debugShowCheckedModeBanner: false,
        theme: conectTheme(Brightness.light),
        darkTheme: conectTheme(Brightness.dark),
        home: const VendorGate(),
      );
}

class VendorGate extends StatefulWidget {
  const VendorGate({super.key});
  @override
  State<VendorGate> createState() => _VendorGateState();
}

class _VendorGateState extends State<VendorGate> {
  final api = Api();
  bool ready = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final p = await SharedPreferences.getInstance();
    api.token = p.getString('token');
    if (api.token != null) {
      try {
        await api.send('GET', '/vendor/profile');
      } catch (_) {
        api.token = null;
      }
    }
    if (mounted) setState(() => ready = true);
  }

  Future<void> _signedIn() async {
    final p = await SharedPreferences.getInstance();
    await p.setString('token', api.token!);
    if (mounted) setState(() {});
  }

  Future<void> _signOut() async {
    api.token = null;
    final p = await SharedPreferences.getInstance();
    await p.remove('token');
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (!ready) return const ConectSplash();
    if (api.token == null) return FirstRunGate(child: VendorLogin(api: api, onLogin: _signedIn));
    return VendorDashboard(api: api, onSignOut: _signOut);
  }
}

class VendorLogin extends StatefulWidget {
  final Api api;
  final VoidCallback onLogin;
  const VendorLogin({super.key, required this.api, required this.onLogin});
  @override
  State<VendorLogin> createState() => _VendorLoginState();
}

class _VendorLoginState extends State<VendorLogin> {
  final name = TextEditingController(), email = TextEditingController(), password = TextEditingController();
  bool busy = false, register = false, hide = true;
  String error = '';

  @override
  void dispose() {
    name.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> resend() async {
    try {
      await widget.api.send('POST', '/auth/resend-verification', {'email': email.text.trim()});
      if (mounted) setState(() => error = 'If verification is needed, a new email will arrive shortly. Check spam/junk too.');
    } catch (e) {
      if (mounted) setState(() => error = cleanError(e));
    }
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final r = await widget.api.send(
        'POST',
        register ? '/auth/register' : '/auth/login',
        register
            ? {'name': name.text.trim(), 'email': email.text.trim(), 'password': password.text, 'role': 'vendor'}
            : {'email': email.text.trim(), 'password': password.text},
      );
      if (r['needsVerification'] == true) {
        if (!mounted) return;
        await showDialog<void>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Verify your email'),
            content: Text('We sent a verification link to ${email.text.trim()}. Open it before signing in.\n\nCan’t find it? Check your spam or junk folder and mark it “Not spam”.'),
            actions: [
              TextButton(
                onPressed: () async {
                  await resend();
                  if (dialogContext.mounted) Navigator.pop(dialogContext);
                },
                child: const Text('Resend email'),
              ),
              TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close')),
            ],
          ),
        );
        return;
      }
      if (r['user']?['role'] != 'vendor') throw Exception('Use a registered vendor account.');
      widget.api.token = r['token'];
      widget.onLogin();
    } catch (e) {
      if (mounted) setState(() => error = cleanError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: Container(
        decoration: conectHeaderBg,
        child: Column(children: [
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
              child: Column(children: [
                const ConectBrandMark(size: 72),
                const SizedBox(height: 10),
                const ConectWordmark(fontSize: 34, onDark: true),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
                  decoration: BoxDecoration(color: conectOrange, borderRadius: BorderRadius.circular(20)),
                  child: const Text('VENDOR',
                      style: TextStyle(color: Colors.white, fontSize: 11, letterSpacing: 2, fontWeight: FontWeight.w800)),
                ),
              ]),
            ),
          ),
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: Theme.of(context).scaffoldBackgroundColor,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              ),
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
                child: Align(
                  alignment: Alignment.topCenter,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Text(register ? 'Create vendor account' : 'Sign in',
                          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Text(register ? 'Start selling on Cönëct' : 'Manage your store and orders',
                          style: TextStyle(color: Theme.of(context).hintColor)),
                      const SizedBox(height: 20),
                      if (register) ...[
                        TextField(
                            controller: name,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(labelText: 'Your full name')),
                        const SizedBox(height: 14),
                      ],
                      TextField(
                          controller: email,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(labelText: 'Email')),
                      const SizedBox(height: 14),
                      TextField(
                        controller: password,
                        obscureText: hide,
                        decoration: InputDecoration(
                          labelText: 'Password',
                          suffixIcon: IconButton(
                            icon: Icon(hide ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                            onPressed: () => setState(() => hide = !hide),
                          ),
                        ),
                      ),
                      if (error.isNotEmpty)
                        Padding(padding: const EdgeInsets.only(top: 12), child: Text(error, style: TextStyle(color: cs.error))),
                      if (error.toLowerCase().contains('verify your email'))
                        TextButton(onPressed: busy ? null : resend, child: const Text('Resend verification email')),
                      const SizedBox(height: 20),
                      FilledButton(
                          onPressed: busy ? null : submit,
                          child: Text(busy ? 'Please wait…' : register ? 'Create vendor account' : 'Sign in')),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: busy
                            ? null
                            : () => setState(() {
                                  register = !register;
                                  error = '';
                                }),
                        child: Text(register ? 'I already have an account' : 'Create a vendor account'),
                      ),
                    ]),
                  ),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

class VendorDashboard extends StatefulWidget {
  final Api api;
  final VoidCallback onSignOut;
  const VendorDashboard({super.key, required this.api, required this.onSignOut});
  @override
  State<VendorDashboard> createState() => _VendorDashboardState();
}

class _VendorDashboardState extends State<VendorDashboard> {
  Map<String, dynamic>? data;
  List products = [], orders = [], documents = [];
  bool busy = true;
  String error = '';
  int tab = 0;
  int imgVersion = 0;
  Timer? timer;
  List<String> bizTypes = ['food'];
  final name = TextEditingController(),
      phone = TextEditingController(),
      address = TextEditingController(),
      reg = TextEditingController();
  final itemName = TextEditingController(), itemPrice = TextEditingController();
  double? storeLat, storeLng;

  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 10), (_) {
            load(quiet: true);
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    for (final c in [name, phone, address, reg, itemName, itemPrice]) {
      c.dispose();
    }
    super.dispose();
  }

  void msg(String s) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s)));

  Future<void> load({bool quiet = false}) async {
    try {
      final p = await widget.api.send('GET', '/vendor/profile');
      final docs = await widget.api.send('GET', '/verification/documents');
      final approved = p['approved'] == true;
      final pr = approved ? await widget.api.send('GET', '/vendor/products') : [];
      final o = approved ? await widget.api.send('GET', '/vendor/orders') : [];
      if (!mounted) return;
      setState(() {
        data = Map<String, dynamic>.from(p);
        products = pr;
        orders = o;
        documents = docs;
        busy = false;
        error = '';
      });
      final profile = p['profile'];
      if (!quiet && profile is Map) {
        name.text = profile['business_name'] ?? '';
        final bt = profile['business_types'] is List ? profile['business_types'] as List : [profile['business_type']];
        bizTypes = [for (final x in bt) if (vendorCategories.containsKey(x)) x as String];
        if (bizTypes.isEmpty) bizTypes = ['food'];
        phone.text = profile['phone'] ?? '';
        address.text = profile['address'] ?? '';
        reg.text = profile['registration_number'] ?? '';
        setState(() {});
      }
    } catch (e) {
      if (mounted && !quiet) setState(() {
        error = cleanError(e);
        busy = false;
      });
    }
  }

  Future<void> saveProfile() async {
  if (bizTypes.isEmpty) return msg('Choose at least one category.');
    try {
      await widget.api.send('PUT', '/vendor/profile', {
        'business_name': name.text.trim(),
        'business_types': bizTypes,
        'phone': phone.text.trim(),
        'address': address.text.trim(),
        'registration_number': reg.text.trim(),
      });
      await load();
      msg('Profile saved. Submit your verification documents to the Cönëct admin team.');
    } catch (e) {
      msg(cleanError(e));
    }
  }

  Future<void> uploadDocument(String documentType) async {
    try {
      final result = await FilePicker.platform
          .pickFiles(type: FileType.custom, allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'], withData: true);
      if (result == null) return;
      final file = result.files.single;
      final bytes = file.bytes;
      if (bytes == null || bytes.isEmpty) throw Exception('Could not read the selected file.');
      if (bytes.length > 2 * 1024 * 1024) throw Exception('Choose a file no larger than 2 MB.');
      final ext = (file.extension ?? '').toLowerCase();
      final mime = ext == 'pdf' ? 'application/pdf' : (ext == 'png' ? 'image/png' : 'image/jpeg');
      await widget.api.send('POST', '/verification/documents',
          {'document_type': documentType, 'filename': file.name, 'mime_type': mime, 'data_base64': base64Encode(bytes)});
      await load();
      msg('Document submitted securely for review.');
    } catch (e) {
      msg(cleanError(e));
    }
  }

  Future<void> captureStoreLocation() async {
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        throw Exception('Location permission is required to register your store.');
      }
      final p = await Geolocator.getCurrentPosition();
      if (mounted) {
        setState(() {
          storeLat = p.latitude;
          storeLng = p.longitude;
        });
      }
      msg('Store GPS location saved.');
    } catch (e) {
      msg(cleanError(e));
    }
  }

  Future<void> createStore() async {
    if (storeLat == null || storeLng == null) return msg('Capture your store GPS location before creating the store.');
    try {
      await widget.api.send('POST', '/vendor/store', {'lat': storeLat, 'lng': storeLng, 'delivery_fee': 300});
      await load();
      msg('Store created closed and sent for review.');
    } catch (e) {
      msg(cleanError(e));
    }
  }

  Future<void> addProduct() async {
    final price = double.tryParse(itemPrice.text.trim());
    if (itemName.text.trim().isEmpty || price == null) return msg('Enter a product name and a valid price.');
    try {
      await widget.api.send('POST', '/vendor/products', {'name': itemName.text.trim(), 'price': price, 'available': true});
      itemName.clear();
      itemPrice.clear();
      await load();
      msg('Product added.');
    } catch (e) {
      msg(cleanError(e));
    }
  }

  Future<void> changeOrderStatus(dynamic order, String status) async {
    try {
      await widget.api.send('PATCH', '/vendor/orders/${order['id']}/status', {'status': status});
      await load();
      msg(status == 'preparing' ? 'Order marked as preparing.' : 'Order marked ready for courier pickup.');
    } catch (e) {
      msg(cleanError(e));
    }
  }
  Future<void> uploadProductImage(dynamic p) async {
    try {
      final result = await FilePicker.platform
          .pickFiles(type: FileType.custom, allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'], withData: true);
      if (result == null) return;
      final bytes = result.files.single.bytes;
      if (bytes == null || bytes.isEmpty) throw Exception('Could not read the selected photo.');
      msg('Preparing photo…');
      await Future<void>.delayed(const Duration(milliseconds: 50));
      final decoded = img.decodeImage(bytes);
      if (decoded == null) throw Exception('That file is not a supported image. Use JPG, PNG or WebP.');
      final upright = img.bakeOrientation(decoded);
      final small = upright.width > 900 ? img.copyResize(upright, width: 900) : upright;
      final jpg = img.encodeJpg(small, quality: 82);
      await widget.api.send('POST', '/vendor/products/${p['id']}/image',
          {'mime_type': 'image/jpeg', 'data_base64': base64Encode(jpg)});
      if (mounted) setState(() => imgVersion++);
      msg('Photo saved.');
    } catch (e) {
      msg(cleanError(e));
    }
  }
  Future<void> uploadStoreImage() async {
    try {
      final result = await FilePicker.platform
          .pickFiles(type: FileType.custom, allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'], withData: true);
      if (result == null) return;
      final bytes = result.files.single.bytes;
      if (bytes == null || bytes.isEmpty) throw Exception('Could not read the selected photo.');
      msg('Preparing photo…');
      await Future<void>.delayed(const Duration(milliseconds: 50));
      final decoded = img.decodeImage(bytes);
      if (decoded == null) throw Exception('That file is not a supported image. Use JPG, PNG or WebP.');
      final upright = img.bakeOrientation(decoded);
      final small = upright.width > 900 ? img.copyResize(upright, width: 900) : upright;
      final jpg = img.encodeJpg(small, quality: 82);
      await widget.api.send('POST', '/vendor/store/image', {'mime_type': 'image/jpeg', 'data_base64': base64Encode(jpg)});
      if (mounted) setState(() => imgVersion++);
      msg('Business photo saved.');
    } catch (e) {
      msg(cleanError(e));
    }
  }
  Future<void> setProductAvailable(dynamic p, bool v) async {
    try {
      await widget.api.send('PATCH', '/vendor/products/${p['id']}', {'available': v});
      await load();
    } catch (e) {
      msg(cleanError(e));
    }
  }
  Future<void> editProduct(dynamic p) async {
    final v = double.tryParse('${p['price']}') ?? 0;
    final nameC = TextEditingController(text: '${p['name']}');
    final priceC = TextEditingController(text: v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString());
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit product'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: nameC, decoration: const InputDecoration(labelText: 'Product name')),
          const SizedBox(height: 12),
          TextField(
            controller: priceC,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Price (₦)'),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true) return;
    final newName = nameC.text.trim();
    final newPrice = double.tryParse(priceC.text.trim());
    if (newName.isEmpty || newPrice == null || newPrice < 0) return msg('Enter a product name and a valid price.');
    try {
      await widget.api.send('PATCH', '/vendor/products/${p['id']}', {'name': newName, 'price': newPrice});
      await load();
      msg('Product updated.');
    } catch (e) {
      msg(cleanError(e));
    }
  }

  Future<void> setStoreOpen(bool v) async {
    try {
      await widget.api.send('PATCH', '/vendor/store', {'is_open': v});
      await load();
    } catch (e) {
      msg(cleanError(e));
    }
  }

  List<Widget> get _headerActions => [
        IconButton(tooltip: 'Refresh', icon: const Icon(Icons.refresh_rounded, color: Colors.white), onPressed: () => load()),
        IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout, color: Colors.white), onPressed: widget.onSignOut),
      ];

  @override
  Widget build(BuildContext context) {
    if (busy) return const ConectSplash();
    final approved = data?['approved'] == true;
        return approved
        ? _approvedShell(context)
        : VendorApplication(
            api: widget.api,
            data: data ?? {},
            documents: documents,
            onChanged: () => load(quiet: true),
            onSignOut: widget.onSignOut,
          );
  }

  // ---------------- Approved vendor ----------------

  Widget _approvedShell(BuildContext context) {
    final store = data?['store'];
    final isOpen = store != null && store['is_open'] == true;
    final newCount = orders.where((o) => o['paid'] == true && o['status'] == 'placed').length;
    final titles = ['Orders', 'Products', 'Store', 'Wallet'];
    return GradientPage(
      title: store?['name'] ?? 'Your store',
      subtitle: '${titles[tab]} · ${isOpen ? 'Open for orders' : 'Closed'}',
      actions: _headerActions,
      bottomBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) => setState(() => tab = i),
        destinations: [
          NavigationDestination(
            icon: Badge(label: Text('$newCount'), isLabelVisible: newCount > 0, child: const Icon(Icons.receipt_long_outlined)),
            selectedIcon: Badge(label: Text('$newCount'), isLabelVisible: newCount > 0, child: const Icon(Icons.receipt_long_rounded)),
            label: 'Orders',
          ),
          const NavigationDestination(icon: Icon(Icons.restaurant_menu_outlined), selectedIcon: Icon(Icons.restaurant_menu_rounded), label: 'Products'),
          const NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront_rounded), label: 'Store'),
          const NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet_rounded), label: 'Wallet'),
        ],
            ),
      child: tab == 0
          ? _ordersTab()
          : tab == 1
              ? _productsTab()
              : tab == 2
                  ? _storeTab()
                  : WalletView(key: const ValueKey('wallet'), send: widget.api.send),
    );
  }

  (String, Color) _badge(String status, bool paid) {
    if (status == 'cancelled') return ('Cancelled', const Color(0xFFDC2626));
    if (!paid) return ('Awaiting payment', conectOrange);
    switch (status) {
      case 'delivered':
        return ('Delivered', const Color(0xFF16A34A));
      case 'picked_up':
        return ('Picked up', conectPurple);
      case 'ready':
        return ('Ready for pickup', conectPurple);
      case 'preparing':
        return ('Preparing', conectPurple);
      default:
        return ('New order', conectOrange);
    }
  }

  Widget _countCard(String label, int count, Color color) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Column(children: [
              Text('$count', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
              Text(label, style: const TextStyle(fontSize: 12)),
            ]),
          ),
        ),
      );

  Widget _ordersTab() {
    final fresh = orders.where((o) => o['paid'] == true && o['status'] == 'placed').length;
    final prep = orders.where((o) => o['status'] == 'preparing').length;
    final ready = orders.where((o) => o['status'] == 'ready').length;
    return RefreshIndicator(
      onRefresh: () => load(),
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
        if (error.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(error, style: TextStyle(color: Theme.of(context).colorScheme.error))),
        Row(children: [
          _countCard('New', fresh, conectOrange),
          _countCard('Preparing', prep, conectPurple),
          _countCard('Ready', ready, const Color(0xFF16A34A)),
        ]),
        const SizedBox(height: 12),
        if (orders.isEmpty)
          const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No orders yet. New paid orders appear here automatically.'))),
        for (final o in orders) _orderCard(o),
      ]),
    );
  }

  Widget _orderCard(dynamic o) {
    final status = o['status'].toString();
    final paid = o['paid'] == true;
    final (label, color) = _badge(status, paid);
    final id = o['id'].toString();
    final short = '#${(id.length > 8 ? id.substring(0, 8) : id).toUpperCase()}';
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(short, style: const TextStyle(fontWeight: FontWeight.w800)),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(color: color.withValues(alpha: .14), borderRadius: BorderRadius.circular(20)),
              child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
            ),
          ]),
          const SizedBox(height: 8),
          Text('${o['customer_name']}', style: const TextStyle(fontWeight: FontWeight.w600)),
          Text('${o['line1']}, ${o['city']}', style: TextStyle(color: Theme.of(context).hintColor)),
          const SizedBox(height: 8),
          Text('You earn ${naira(o['vendor_net_amount'])}', style: const TextStyle(color: conectPurple, fontWeight: FontWeight.w800, fontSize: 18)),
          if (paid && status == 'placed') ...[
            const SizedBox(height: 10),
            SizedBox(width: double.infinity, child: FilledButton(onPressed: () => changeOrderStatus(o, 'preparing'), child: const Text('Start preparing'))),
          ],
          if (paid && status == 'preparing') ...[
            const SizedBox(height: 10),
            SizedBox(width: double.infinity, child: FilledButton(onPressed: () => changeOrderStatus(o, 'ready'), child: const Text('Mark ready for pickup'))),
          ],
        ]),
      ),
    );
  }

  Widget _productsTab() => ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Add product', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              const SizedBox(height: 12),
              TextField(controller: itemName, decoration: const InputDecoration(labelText: 'Product name')),
              const SizedBox(height: 12),
              TextField(
                  controller: itemPrice,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Price in naira')),
              const SizedBox(height: 14),
              FilledButton(onPressed: addProduct, child: const Text('Add product')),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        const Text('Your products', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        const SizedBox(height: 8),
        if (products.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('No products yet.')),
                for (final p in products)
          Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              contentPadding: const EdgeInsets.fromLTRB(12, 6, 8, 6),
              leading: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => uploadProductImage(p),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: SizedBox(
                    width: 56,
                    height: 56,
                    child: Image.network(
                      '$apiUrl/products/${p['id']}/image?v=$imgVersion',
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: conectLavender,
                        child: const Icon(Icons.add_a_photo_outlined, color: conectPurple),
                      ),
                    ),
                  ),
                ),
              ),
              title: Text(p['name'], style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(naira(p['price']), style: const TextStyle(color: conectPurple, fontWeight: FontWeight.w700)),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                IconButton(icon: const Icon(Icons.edit_outlined), tooltip: 'Edit', onPressed: () => editProduct(p)),
                Switch(value: p['available'] == true, onChanged: (v) => setProductAvailable(p, v)),
              ]),
            ),
          ),

      ]);

  Widget _storeTab() {
    final store = data?['store'];
    final profile = data?['profile'];
    return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
      if (store != null)
        Card(
          child: SwitchListTile(
            title: Text(store['name'] ?? 'Your store', style: const TextStyle(fontWeight: FontWeight.w800)),
            subtitle: Text(store['is_open'] == true ? 'Open for orders' : 'Closed. Customers can’t order.'),
            value: store['is_open'] == true,
            onChanged: setStoreOpen,
          ),
        ),
      if (store is Map)
        Card(
          child: ListTile(
            leading: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 56,
                height: 56,
                child: Image.network(
                  '$apiUrl/stores/${store['id']}/image?v=$imgVersion',
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    color: conectLavender,
                    child: const Icon(Icons.add_a_photo_outlined, color: conectPurple),
                  ),
                ),
              ),
            ),
            title: const Text('Business photo', style: TextStyle(fontWeight: FontWeight.w800)),
            subtitle: const Text('Shown to customers on your store.'),
            trailing: TextButton(onPressed: uploadStoreImage, child: const Text('Change')),
          ),
        ),
      if (profile is Map)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Business profile', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              const SizedBox(height: 10),
              Text('${profile['business_name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
              Text('${profile['business_types'] is List ? (profile['business_types'] as List).join(', ') : (profile['business_type'] ?? '')} · ${profile['phone'] ?? ''}'),
              Text('${profile['address'] ?? ''}'),
            ]),
          ),
        ),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed: widget.onSignOut, icon: const Icon(Icons.logout), label: const Text('Sign out')),
    ]);
  }

  // ---------------- Application (not yet approved) ----------------

  Widget _applicationShell(BuildContext context) {
    final profile = data?['profile'];
    final store = data?['store'];
    final cs = Theme.of(context).colorScheme;
    return GradientPage(
      title: 'Vendor application',
      subtitle: profile == null ? 'Complete your application' : 'Pending admin review',
      actions: [IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout, color: Colors.white), onPressed: widget.onSignOut)],
      child: RefreshIndicator(
        onRefresh: () => load(),
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
          if (error.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(error, style: TextStyle(color: cs.error))),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('Business profile', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                const SizedBox(height: 12),
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Business name')),
                const SizedBox(height: 12),
                CategoryPicker(selected: bizTypes, onChanged: (v) => setState(() => bizTypes = v)),
                const SizedBox(height: 12),
                TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Business phone')),
                const SizedBox(height: 12),
                TextField(controller: address, decoration: const InputDecoration(labelText: 'Business address')),
                const SizedBox(height: 12),
                TextField(controller: reg, decoration: const InputDecoration(labelText: 'Registration number (if available)')),
                const SizedBox(height: 16),
                FilledButton(onPressed: saveProfile, child: const Text('Save business profile')),
              ]),
            ),
          ),
          if (profile != null && store == null) ...[
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text('Store location', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                  const SizedBox(height: 4),
                  const Text('Stand at your store, then capture its GPS location so nearby customers can find you.'),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: captureStoreLocation,
                    icon: Icon(storeLat == null ? Icons.my_location : Icons.check_circle),
                    label: Text(storeLat == null ? 'Capture store GPS location' : 'Store GPS captured'),
                  ),
                  if (storeLat != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('GPS: ${storeLat!.toStringAsFixed(5)}, ${storeLng!.toStringAsFixed(5)}', textAlign: TextAlign.center),
                    ),
                  const SizedBox(height: 10),
                  FilledButton(onPressed: createStore, child: const Text('Create store for review')),
                ]),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('Verification documents', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                const SizedBox(height: 4),
                const Text('JPG, PNG or PDF, up to 2 MB each.'),
                const SizedBox(height: 12),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  OutlinedButton.icon(
                    onPressed: profile == null ? null : () => uploadDocument('government_id'),
                    icon: const Icon(Icons.badge_outlined),
                    label: const Text('Upload government ID'),
                  ),
                  if (bizTypes.contains('food'))
                    OutlinedButton.icon(
                      onPressed: profile == null ? null : () => uploadDocument('food_safety'),
                      icon: const Icon(Icons.health_and_safety_outlined),
                      label: const Text('Upload food safety'),
                    ),
                ]),
                if (profile == null) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Save your business profile before uploading documents.')),
                for (final d in documents)
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
          Text(
            'Final approval requires approved documents and the required in-person orientation. Your store stays closed until approved.',
            style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor),
          ),
        ]),
      ),
    );
  }
}
