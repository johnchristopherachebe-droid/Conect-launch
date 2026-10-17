import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../brand.dart';
import '../widgets.dart';

class _Slide {
  final IconData icon;
  final String title, body, tip;
  const _Slide(this.icon, this.title, this.body, this.tip);
}

const _slides = [
  _Slide(
    Icons.storefront_rounded,
    'Everything you need, delivered',
    'Food, groceries, pharmacy and more from stores near you, brought to your door.',
    'Tip: allow location so we can show stores near you.',
  ),
  _Slide(
    Icons.shopping_bag_rounded,
    'Order in a few taps',
    'Pick a store, add your items, choose your address and pay securely with Paystack.',
    'Tip: add a delivery note, like “blue gate, call when you arrive”.',
  ),
  _Slide(
    Icons.delivery_dining_rounded,
    'Follow your order live',
    'See each step from the kitchen to your door, and your rider on the map.',
    'Tip: the status updates on its own, no need to refresh.',
  ),
  _Slide(
    Icons.lock_rounded,
    'Your delivery PIN keeps it safe',
    'You get a 4-digit PIN for every order. Give it to your rider only when your order arrives.',
    'Tip: never share your PIN before your order is in your hands.',
  ),
];

/// Shows the onboarding once per device, then the wrapped screen.
class FirstRunGate extends StatefulWidget {
  final Widget child;
  const FirstRunGate({super.key, required this.child});
  @override
  State<FirstRunGate> createState() => _FirstRunGateState();
}

class _FirstRunGateState extends State<FirstRunGate> {
  bool? seen;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    if (mounted) setState(() => seen = p.getBool('seen_onboarding') ?? false);
  }

  Future<void> _done() async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('seen_onboarding', true);
    if (mounted) setState(() => seen = true);
  }

  @override
  Widget build(BuildContext context) {
    if (seen == null) return const ConectSplash();
    return seen! ? widget.child : OnboardingScreen(onDone: _done);
  }
}

class OnboardingScreen extends StatefulWidget {
  final VoidCallback onDone;
  const OnboardingScreen({super.key, required this.onDone});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final controller = PageController();
  int page = 0;

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void next() {
    if (page == _slides.length - 1) {
      widget.onDone();
      return;
    }
    controller.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
  }

  @override
  Widget build(BuildContext context) {
    final last = page == _slides.length - 1;
    return Scaffold(
      body: Container(
        decoration: conectHeaderBg,
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: Visibility(
                    visible: !last,
                    maintainSize: true,
                    maintainAnimation: true,
                    maintainState: true,
                    child: TextButton(
                      onPressed: widget.onDone,
                      child: const Text('Skip', style: TextStyle(color: Color(0xFFD9CCF5), fontSize: 15)),
                    ),
                  ),
                ),
                Expanded(
                  child: PageView.builder(
                    controller: controller,
                    itemCount: _slides.length,
                    onPageChanged: (i) => setState(() => page = i),
                    itemBuilder: (_, i) => _SlideView(slide: _slides[i], first: i == 0),
                  ),
                ),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  for (var i = 0; i < _slides.length; i++)
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      width: i == page ? 24 : 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: i == page ? Colors.white : Colors.white30,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                ]),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton(onPressed: next, child: Text(last ? 'Get Started' : 'Next')),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _SlideView extends StatelessWidget {
  final _Slide slide;
  final bool first;
  const _SlideView({required this.slide, required this.first});

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (first)
              const ConectBrandMark(size: 110)
            else
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: .12)),
                child: Icon(slide.icon, size: 56, color: Colors.white),
              ),
            const SizedBox(height: 32),
            Text(slide.title,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, height: 1.15)),
            const SizedBox(height: 12),
            Text(slide.body,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFFD9CCF5), fontSize: 16, height: 1.4)),
            const SizedBox(height: 22),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: conectOrange.withValues(alpha: .18),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(children: [
                const Icon(Icons.lightbulb_outline_rounded, size: 18, color: Color(0xFFFFB366)),
                const SizedBox(width: 8),
                Expanded(child: Text(slide.tip, style: const TextStyle(color: Colors.white, fontSize: 13.5))),
              ]),
            ),
          ]),
        ),
      );
}
