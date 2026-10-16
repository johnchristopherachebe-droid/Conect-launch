import 'package:flutter/material.dart';

const BoxDecoration conectHeaderBg = BoxDecoration(
  gradient: LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF0B0615), Color(0xFF3B1480)],
  ),
);

/// Purple gradient header + rounded content panel used by most screens.
class GradientPage extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget child;
  final Widget? bottomBar;
  final List<Widget> actions;
  const GradientPage({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.bottomBar,
    this.actions = const [],
  });

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.canPop(context);
    return Scaffold(
      body: Container(
        decoration: conectHeaderBg,
        child: Column(children: [
          SafeArea(
            bottom: false,
            child: Padding(
              padding: EdgeInsets.fromLTRB(canPop ? 8 : 20, 4, 8, 20),
              child: Row(children: [
                if (canPop)
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                    onPressed: () => Navigator.pop(context),
                  ),
                if (canPop) const SizedBox(width: 4),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700)),
                    if (subtitle != null)
                      Text(subtitle!, style: const TextStyle(color: Color(0xFFD9CCF5), fontSize: 13)),
                  ]),
                ),
                ...actions,
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
                child: child,
              ),
            ),
          ),
        ]),
      ),
      bottomNavigationBar: bottomBar,
    );
  }
}