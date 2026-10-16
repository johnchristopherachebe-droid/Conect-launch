import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';
import '../brand.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
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
      if (register) {
        final result = await context.read<AppState>().api.post('/auth/register', {
          'email': email.text.trim(), 'password': pass.text, 'name': name.text.trim(),
        });
        if (result['needsVerification'] == true) {
          setState(() { awaitingVerification = true; verificationEmail = email.text.trim(); });
          return;
        }
      } else {
        await context.read<AppState>().signIn('/auth/login', {'email': email.text.trim(), 'password': pass.text});
      }
    } on ApiException catch (e) {
      setState(() => error = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> resendVerification() async {
    setState(() { busy = true; error = null; });
    try {
      await context.read<AppState>().api.post('/auth/resend-verification', {'email': verificationEmail});
      setState(() => error = 'If your account needs verification, a new email will arrive shortly. Check spam/junk too.');
    } on ApiException catch (e) { setState(() => error = e.message); }
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
               const ConectWordmark(fontSize: 40)
                const SizedBox(height: 4),
                Text(awaitingVerification ? 'Verify your email' : register ? 'Create your account' : 'Sign in to order', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 24),
                if (awaitingVerification) ...[
                  const Icon(Icons.mark_email_read_outlined, size: 54),
                  const SizedBox(height: 12),
                  Text('We sent a verification link to ${verificationEmail ?? email.text}. Open it to activate your account, then return here to sign in.', textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: busy ? null : resendVerification, child: Text(busy ? 'Please wait…' : 'Resend verification email')),
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
                    decoration: InputDecoration(
                        labelText: 'Password', helperText: register ? 'At least 8 characters' : null,
                        border: const OutlineInputBorder())),
                if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: TextStyle(color: cs.error))),
                if (!register && error != null && error!.toLowerCase().contains('verify your email'))
                  TextButton(onPressed: busy ? null : () async { verificationEmail = email.text.trim(); await resendVerification(); }, child: const Text('Resend verification email')),
                const SizedBox(height: 20),
                FilledButton(onPressed: busy ? null : submit,
                    child: Padding(padding: const EdgeInsets.all(14), child: Text(register ? 'Create account' : 'Sign in'))),
                TextButton(onPressed: () => setState(() { register = !register; error = null; }),
                    child: Text(register ? 'I already have an account' : 'Create an account')),
                ],
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
