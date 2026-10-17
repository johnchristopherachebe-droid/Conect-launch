import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'brand.dart';

class _Slide {
  final IconData icon;
  final String title, body, tip;
  const _Slide(this.icon, this.title, this.body, this.tip);
}

const _slides = [
  _Slide(
    Icons.storefront_rounded,
    'Sell to customers near you',
    'Cönëct brings orders from your neighbourhood straight to your kitchen or shop.',
    'Tip: have your business details and a government ID ready.',
  ),
  _Slide(
    Icons.verified_user_rounded,
    'Get verified',
    'We check your ID and, for food businesses, your food-safety approval. Then our team completes a short orientation with you in person.',
    'Tip: clear photos or PDFs under 2 MB are reviewed fastest.',
  ),
  _Slide(
    Icons.restaurant_menu_rounded,
    'Set up your menu',
    'Add your products with prices and photos. Tap a product’s photo to change it any time.',
    'Tip: good photos help your items sell.',
  ),
  _Slide(
    Icons.delivery_dining_rounded,
    'Prepare, then a rider collects',
    'New paid orders appear automatically. Start preparing, mark the order ready, and a rider picks it up.',
    'Tip: switch your store to closed when you are too busy.',
  ),
];

/// Shows the welcome slides once per device, then the wrapped screen.
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
    if (mounted) setState(() => seen = p.getBool('seen_vendor_onboarding') ?? false);
  }

  Future<void> _done() async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('seen_vendor_onboarding', true);
    if (mounted) setState(() => seen = true);
  }

  @override
  Widget build(BuildContext context) {
    if (seen == null) return const ConectSplash();
    return seen! ? widget.child : _Onboarding(onDone: _done);
  }
}

class _Onboarding extends StatefulWidget {
  final VoidCallback onDone;
  const _Onboarding({required this.onDone});
  @override
  State<_Onboarding> createState() => _OnboardingState();
}

class _OnboardingState extends State<_Onboarding> {
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
                  padding: const EdgeInsets.all(24),
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
              decoration: BoxDecoration(color: conectOrange.withValues(alpha: .18), borderRadius: BorderRadius.circular(14)),
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
