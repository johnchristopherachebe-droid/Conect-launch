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
  bool register = false, busy = false, awaitingVerification = false;
  String? error, verificationEmail;

  Future<void> submit() async {
    setState(() { busy = true; error = null; });
    try {
      final r = await api.post(register ? '/auth/register' : '/auth/login', {
        'email': email.text.trim(), 'password': pass.text,
        if (register) ...{'name': name.text.trim(), 'role': 'courier'},
      });
      if (r['needsVerification'] == true) {
        setState(() { awaitingVerification = true; verificationEmail = email.text.trim(); });
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
    setState(() { busy = true; error = null; });
    try { await api.post('/auth/resend-verification', {'email': verificationEmail}); setState(() => error = 'If verification is needed, a new email will arrive shortly. Check spam/junk too.'); }
    on ApiException catch (e) { setState(() => error = e.message); }
    finally { if (mounted) setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Center(child: ConectBrandMark(size: 88)),
                const SizedBox(height: 8),
                Text('cönëct Courier', textAlign: TextAlign.center, style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: cs.primary)),
                const SizedBox(height: 4),
                Text(awaitingVerification ? 'Verify your email' : register ? 'Sign up to deliver' : 'Sign in to start delivering'),
                const SizedBox(height: 24),
                if (awaitingVerification) ...[
                  const Icon(Icons.mark_email_read_outlined, size: 52),
                  Text('We sent a verification link to ${verificationEmail ?? email.text}. Open it, then return here to sign in.', textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  OutlinedButton(onPressed: busy ? null : resendVerification, child: Text(busy ? 'Please wait…' : 'Resend verification email')),
                  TextButton(onPressed: () => setState(() { awaitingVerification = false; register = false; error = null; }), child: const Text('Back to sign in')),
                ] else ...[
                if (register) ...[
                  TextField(controller: name, decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder())),
                  const SizedBox(height: 12),
                ],
                TextField(controller: email, keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: pass, obscureText: true,
                    decoration: const InputDecoration(labelText: 'Password (8+ characters)', border: OutlineInputBorder())),
                if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: TextStyle(color: cs.error))),
                if (!register && error != null && error!.toLowerCase().contains('verify your email'))
                  TextButton(onPressed: busy ? null : () async { verificationEmail = email.text.trim(); await resendVerification(); }, child: const Text('Resend verification email')),
                const SizedBox(height: 20),
                FilledButton(onPressed: busy ? null : submit,
                    child: Padding(padding: const EdgeInsets.all(14), child: Text(register ? 'Create account' : 'Sign in'))),
                TextButton(onPressed: () => setState(() { register = !register; error = null; }),
                    child: Text(register ? 'I already have an account' : 'Sign up as a courier')),
                ],
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
