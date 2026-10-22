import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'push.dart';

class CartLine {
  final int productId;
  final String name;
  final num price;
  int qty;
  CartLine(this.productId, this.name, this.price, this.qty);
}

class AppState extends ChangeNotifier {
  final api = Api();
  Map<String, dynamic>? user;
  bool ready = false;

  Map<String, dynamic>? store; // store the cart belongs to
  final Map<int, CartLine> cart = {};

  Future<void> init() async {
    final p = await SharedPreferences.getInstance();
    api.token = p.getString('token');
    if (api.token != null) {
      try {
        await api.get('/addresses'); // validates the saved token
        user = {'name': p.getString('name') ?? ''};
        Push.start(api);
      } catch (_) {
        api.token = null;
      }
    }
    ready = true;
    notifyListeners();
  }

  Future<void> signIn(String path, Map<String, dynamic> body) async {
    final r = await api.post(path, body);
    if (r['user']?['role'] != 'customer') {
      throw ApiException('This is not a customer account. Please use the correct Cönëct app.');
    }
    api.token = r['token'];
    user = r['user'];
    final p = await SharedPreferences.getInstance();
    await p.setString('token', api.token!);
    await p.setString('name', user!['name']);
    Push.start(api);
    notifyListeners();
  }

  Future<void> signOut() async {
    await Push.stop(api);
    api.token = null;
    user = null;
    cart.clear();
    final p = await SharedPreferences.getInstance();
    await p.remove('token');
    notifyListeners();
  }

  // Cart
  int get count => cart.values.fold(0, (a, l) => a + l.qty);
  num get subtotal => cart.values.fold<num>(0, (a, l) => a + l.price * l.qty);
  num get fee => store == null ? 0 : n(store!['delivery_fee']);
  num get total => subtotal + fee;
  int qty(int productId) => cart[productId]?.qty ?? 0;

  /// Returns false if the item belongs to a different store than the current cart.
  bool canAddFrom(Map<String, dynamic> s) => store == null || cart.isEmpty || store!['id'] == s['id'];

  void startCartFor(Map<String, dynamic> s) {
    if (store?['id'] != s['id']) cart.clear();
    store = s;
    notifyListeners();
  }

  void change(Map<String, dynamic> product, int delta) {
    final id = product['id'] as int;
    final line = cart.putIfAbsent(id, () => CartLine(id, product['name'], n(product['price']), 0));
    line.qty += delta;
    if (line.qty <= 0) cart.remove(id);
    notifyListeners();
  }

    /// Payment gateways the admin has switched on (and that are set up on the server).
  Future<List<Map<String, dynamic>>> paymentGateways() async {
    final r = await api.get('/payment-gateways');
    return [for (final g in (r as List)) Map<String, dynamic>.from(g as Map)];
  }

  /// Opens the chosen gateway's secure checkout page in the browser.
  Future<void> startPayment(String orderId, {String? gateway}) async {
    final r = await api.post('/orders/$orderId/pay', gateway == null ? null : {'gateway': gateway});
    final ok = await launchUrl(Uri.parse(r['url']), mode: LaunchMode.externalApplication, webOnlyWindowName: '_self');
    if (!ok) throw ApiException('Could not open the payment page');
  }

  Future<Map<String, dynamic>> placeOrder(String addressId) async {
    final o = await api.post('/orders', {
      'storeId': store!['id'],
      'addressId': addressId,
      'items': [for (final l in cart.values) {'productId': l.productId, 'quantity': l.qty}],
    });
    cart.clear();
    notifyListeners();
    return Map<String, dynamic>.from(o);
  }
}
