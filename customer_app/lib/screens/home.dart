import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../brand.dart';
import '../state.dart';
import 'cart.dart';
import 'orders.dart';
import 'store.dart';
import 'support.dart';
import 'account.dart';
import 'store_image.dart';
import '../widgets.dart' show StoreVerification;

const BoxDecoration _headerBg = BoxDecoration(
  gradient: LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF0B0615), Color(0xFF3B1480)],
  ),
);

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const cats = {'All': null, 'Food': 'food', 'Groceries': 'groceries', 'Pharmacy': 'pharmacy', 'Fashion': 'fashion', 'Gadgets': 'gadgets', 'Beauty': 'beauty', 'Courier': 'courier'};
  static const catIcons = {
    'All': Icons.apps_rounded,
    'Food': Icons.restaurant_rounded,
    'Groceries': Icons.shopping_basket_rounded,
    'Pharmacy': Icons.local_pharmacy_rounded,
    'Fashion': Icons.checkroom_rounded,
    'Gadgets': Icons.devices_rounded,
    'Beauty': Icons.face_retouching_natural_rounded,
    'Courier': Icons.delivery_dining_rounded,
  };
  String cat = 'All', search = '';
  Position? currentPosition;
  bool locating = true;
  String? locationError;
  late Future<dynamic> stores;

  @override
  void initState() {
    super.initState();
    stores = Future.value([]);
    locate();
  }

  Future<dynamic> load() {
    final p = currentPosition;
    if (p == null) return Future.value([]);
    final qs = <String, String>{
      if (cats[cat] != null) 'category': cats[cat]!,
      if (search.isNotEmpty) 'search': search,
      'lat': '${p.latitude}',
      'lng': '${p.longitude}',
      'radiusKm': '15',
    };
    return context.read<AppState>().api.get('/stores?${Uri(queryParameters: qs).query}');
  }

  Future<void> locate() async {
    setState(() {
      locating = true;
      locationError = null;
    });
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        throw Exception('Allow location access to see stores near you.');
      }
      final p = await Geolocator.getCurrentPosition();
      if (!mounted) return;
      setState(() {
        currentPosition = p;
        locating = false;
        stores = load();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        currentPosition = null;
        locationError = 'Cönëct needs your location to show nearby stores. Turn on location access and try again.';
        locating = false;
        stores = Future.value([]);
      });
    }
  }

  void reload() => setState(() => stores = load());

  void _open(Widget screen) => Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final locText = locating
        ? 'Finding your location…'
        : currentPosition != null
            ? 'Your current location'
            : 'Location is off';
    return Scaffold(
      body: Container(
        decoration: _headerBg,
        child: Column(children: [
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 8, 16),
              child: Column(children: [
                Row(children: [
                  const Icon(Icons.location_on_rounded, color: Color(0xFFC4B5FD)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Deliver to', style: TextStyle(color: Color(0xFFD9CCF5), fontSize: 12)),
                      Text(locText, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
                    ]),
                  ),
                  IconButton(
                      tooltip: 'Refresh location',
                      icon: const Icon(Icons.my_location, color: Colors.white),
                      onPressed: locate),
                  IconButton(
                      tooltip: 'Sign out',
                      icon: const Icon(Icons.logout, color: Colors.white),
                      onPressed: s.signOut),
                ]),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: TextField(
                    textInputAction: TextInputAction.search,
                    onSubmitted: (v) {
                      search = v.trim();
                      reload();
                    },
                    decoration: InputDecoration(
                      hintText: 'Search food, groceries, fashion, gadgets…',
                      prefixIcon: const Icon(Icons.search),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    ),
                  ),
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
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
                  children: [
                    _banner(),
                    const SizedBox(height: 20),
                    _categories(context),
                    const SizedBox(height: 16),
                    const Text('Stores near you', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 12),
                    _stores(context),
                  ],
                ),
              ),
            ),
          ),
        ]),
      ),
      bottomNavigationBar: Column(mainAxisSize: MainAxisSize.min, children: [
        if (s.count > 0) cartBar(context, s, safe: false),
        NavigationBar(
          selectedIndex: 0,
          onDestinationSelected: (i) {
            if (i == 1) _open(const OrdersScreen());
            if (i == 2) _open(const SupportScreen());
            if (i == 3) _open(const AccountScreen());
          },
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long_rounded), label: 'Orders'),
            NavigationDestination(icon: Icon(Icons.chat_bubble_outline_rounded), selectedIcon: Icon(Icons.chat_bubble_rounded), label: 'Support'),
            NavigationDestination(icon: Icon(Icons.person_outline_rounded), selectedIcon: Icon(Icons.person_rounded), label: 'Profile'),
          ],
        ),
      ]),
    );
  }

  Widget _banner() => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF7C3AED), Color(0xFF4C1D95)],
          ),
        ),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Delicious meals,\nfast delivery!',
                  style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, height: 1.15)),
              const SizedBox(height: 6),
              const Text('From your favorite vendors to your doorstep.',
                  style: TextStyle(color: Color(0xFFE4D9FF), fontSize: 13)),
              const SizedBox(height: 14),
              FilledButton(
                style: FilledButton.styleFrom(
                    backgroundColor: conectOrange,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(0, 40),
                    padding: const EdgeInsets.symmetric(horizontal: 20)),
                onPressed: () {
                  cat = 'Food';
                  reload();
                },
                child: const Text('Order Now'),
              ),
            ]),
          ),
          const SizedBox(width: 8),
          const Text('🍛', style: TextStyle(fontSize: 64)),
        ]),
      );

  Widget _categories(BuildContext context) => SizedBox(
        height: 92,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            for (final c in cats.keys)
              Padding(
                padding: const EdgeInsets.only(right: 14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () {
                    cat = c;
                    reload();
                  },
                  child: SizedBox(
                    width: 72,
                    child: Column(children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: cat == c ? conectPurple : conectLavender,
                        ),
                        child: Icon(catIcons[c], color: cat == c ? Colors.white : conectPurple),
                      ),
                      const SizedBox(height: 6),
                      Text(c,
                          style: TextStyle(fontSize: 12, fontWeight: cat == c ? FontWeight.w800 : FontWeight.w500)),
                    ]),
                  ),
                ),
              ),
          ],
        ),
      );

  Widget _stores(BuildContext context) => FutureBuilder(
        future: stores,
        builder: (_, snap) {
          if (locating || snap.connectionState != ConnectionState.done) {
            return const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()));
          }
          if (locationError != null) return _notice(locationError!, 'Enable location / retry', locate);
          if (snap.hasError) {
            final msg = snap.error is ApiException ? (snap.error as ApiException).message : 'Could not load stores';
            return _notice(msg, 'Try again', reload);
          }
          final list = snap.data as List;
          if (list.isEmpty) {
            return _notice('No stores were found for your location. You may be outside our delivery areas, or try another search or refresh your location.',
                'Refresh location', locate);
          }
          return Column(children: [for (final item in list) _storeCard(context, item as Map<String, dynamic>)]);
        },
      );

  Widget _notice(String text, String label, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          Text(text, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          FilledButton(onPressed: onTap, child: Text(label)),
        ]),
      );

  Widget _storeCard(BuildContext context, Map<String, dynamic> st) {
    final num count = (st['rating_count'] as num?) ?? 0;
    final km = st['distance_km'] == null ? 'Nearby' : '${n(st['distance_km']).toStringAsFixed(1)} km away';
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _open(StoreScreen(storeId: st['id'])),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            StoreImage(storeId: st['id'], emoji: st['emoji'] ?? '🏪'),
            const SizedBox(width: 14),
                        Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Flexible(child: Text(st['name'], style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                  const SizedBox(width: 6),
                  StoreVerification(verified: st['is_verified'] == true),
                ]),
                const SizedBox(height: 4),
                Row(children: [
                  const Icon(Icons.star_rounded, size: 16, color: conectOrange),
                  const SizedBox(width: 3),
                  Text(count > 0 ? '${st['average_rating']} (${count.toInt()})' : 'New'),
                  Text('  •  ${st['eta_minutes']} min'),
                ]),
                const SizedBox(height: 2),
                Text('$km · Distance-based delivery',
                    style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor)),
              ]),
            ),
            const Icon(Icons.chevron_right_rounded),
          ]),
        ),
      ),
    );
  }
}

Widget cartBar(BuildContext context, AppState s, {bool safe = true}) => SafeArea(
      bottom: safe,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton(
          style: FilledButton.styleFrom(padding: const EdgeInsets.all(16)),
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CartScreen())),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('View cart (${s.count})'),
            Text('₦${s.subtotal.toStringAsFixed(0)}'),
          ]),
        ),
      ),
    );
