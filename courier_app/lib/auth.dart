import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'main.dart' show api;
import 'brand.dart';

class AuthScreen extends StatefulWidget {
  final VoidCallback onDone;
  const AuthScreen({super.key, required this.onDone});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final name = TextEditingController(), email = TextEditingController(), pass = TextEditingController();
  bool register = false, busy = false, awaitingVerification = false, hide = true;
  String? error, verificationEmail;

  @override
  void dispose() {
    name.dispose();
    email.dispose();
    pass.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = await api.post(register ? '/auth/register' : '/auth/login', {
        'email': email.text.trim(),
        'password': pass.text,
        if (register) ...{'name': name.text.trim(), 'role': 'courier'},
      });
      if (r['needsVerification'] == true) {
        setState(() {
          awaitingVerification = true;
          verificationEmail = email.text.trim();
        });
        return;
      }
      if (r['user']['role'] != 'courier') throw ApiException('This account is not a courier account. Use the customer app.');
      api.token = r['token'];
      await (await SharedPreferences.getInstance()).setString('token', api.token!);
      widget.onDone();
    } on ApiException catch (e) {
      api.token = null;
      setState(() => error = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> resendVerification() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.post('/auth/resend-verification', {'email': verificationEmail});
      setState(() => error = 'If verification is needed, a new email will arrive shortly. Check spam/junk too.');
    } on ApiException catch (e) {
      setState(() => error = e.message);
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
                  child: const Text('COURIER',
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
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: awaitingVerification ? _verify() : _form(cs),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  List<Widget> _verify() => [
        const Icon(Icons.mark_email_read_outlined, size: 56, color: conectPurple),
        const SizedBox(height: 12),
        const Text('Verify your email', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        Text('We sent a verification link to ${verificationEmail ?? email.text}. Open it, then return here to sign in.',
            textAlign: TextAlign.center),
        if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, textAlign: TextAlign.center)),
        const SizedBox(height: 16),
        FilledButton(onPressed: busy ? null : resendVerification, child: Text(busy ? 'Please wait…' : 'Resend verification email')),
        TextButton(
          onPressed: () => setState(() {
            awaitingVerification = false;
            register = false;
            error = null;
          }),
          child: const Text('Back to sign in'),
        ),
      ];

  List<Widget> _form(ColorScheme cs) => [
        Text(register ? 'Sign up to deliver' : 'Sign in to start delivering',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
        const SizedBox(height: 20),
        if (register) ...[
          TextField(controller: name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 14),
        ],
        TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
        const SizedBox(height: 14),
        TextField(
          controller: pass,
          obscureText: hide,
          decoration: InputDecoration(
            labelText: 'Password (8+ characters)',
            suffixIcon: IconButton(
              icon: Icon(hide ? Icons.visibility_off_outlined : Icons.visibility_outlined),
              onPressed: () => setState(() => hide = !hide),
            ),
          ),
        ),
        if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: TextStyle(color: cs.error))),
        if (!register && error != null && error!.toLowerCase().contains('verify your email'))
          TextButton(
            onPressed: busy
                ? null
                : () async {
                    verificationEmail = email.text.trim();
                    await resendVerification();
                  },
            child: const Text('Resend verification email'),
          ),
        const SizedBox(height: 20),
        FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Please wait…' : register ? 'Create account' : 'Sign in')),
        TextButton(
          onPressed: () => setState(() {
            register = !register;
            error = null;
          }),
          child: Text(register ? 'I already have an account' : 'Sign up as a courier'),
        ),
      ];
}
