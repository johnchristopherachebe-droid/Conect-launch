import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';
import '../brand.dart';

enum _Step { welcome, signIn, register, verify }

const BoxDecoration _bg = BoxDecoration(
  gradient: LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF0B0615), Color(0xFF3B1480)],
  ),
);

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final name = TextEditingController(),
      email = TextEditingController(),
      phone = TextEditingController(),
      pass = TextEditingController();
  _Step step = _Step.welcome;
  bool busy = false, hidePass = true;
  String? error, verificationEmail;

  @override
  void dispose() {
    name.dispose();
    email.dispose();
    phone.dispose();
    pass.dispose();
    super.dispose();
  }

  void go(_Step s) => setState(() {
        step = s;
        error = null;
      });

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (step == _Step.register) {
        final body = <String, dynamic>{
          'email': email.text.trim(),
          'password': pass.text,
          'name': name.text.trim(),
        };
        if (phone.text.trim().isNotEmpty) body['phone'] = phone.text.trim();
        final result = await context.read<AppState>().api.post('/auth/register', body);
        if (result['needsVerification'] == true) {
          setState(() {
            verificationEmail = email.text.trim();
            step = _Step.verify;
          });
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
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await context.read<AppState>().api.post('/auth/resend-verification', {'email': verificationEmail});
      setState(() => error = 'If your account needs verification, a new email will arrive shortly. Check spam/junk too.');
    } on ApiException catch (e) {
      setState(() => error = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => step == _Step.welcome ? _welcome(context) : _form(context);

  Widget _welcome(BuildContext context) => Scaffold(
        body: Container(
          decoration: _bg,
          child: SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                  child: Column(children: [
                    const Spacer(flex: 3),
                    const ConectBrandMark(size: 120),
                    const SizedBox(height: 16),
                    const ConectWordmark(fontSize: 46, onDark: true),
                    const SizedBox(height: 12),
                    const Text('Anything you need, anywhere you are.',
                        textAlign: TextAlign.center, style: TextStyle(color: Color(0xFFD9CCF5), fontSize: 16)),
                    const SizedBox(height: 10),
                    const Text('Food  •  Groceries  •  Essentials  •  More',
                        style: TextStyle(color: Color(0xFFB9A5EA), fontSize: 13)),
                    const Spacer(flex: 4),
                    SizedBox(
                        width: double.infinity,
                        child: FilledButton(onPressed: () => go(_Step.register), child: const Text('Get Started'))),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white, side: const BorderSide(color: Colors.white54)),
                        onPressed: () => go(_Step.signIn),
                        child: const Text('Sign In'),
                      ),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      );

  Widget _form(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final verify = step == _Step.verify, register = step == _Step.register;
    final title = verify ? 'Verify your email' : register ? 'Create Account' : 'Sign In';
    final sub = verify ? 'One last step' : register ? "Let's set up your account" : 'Welcome back!';
    return Scaffold(
      body: Container(
        decoration: _bg,
        child: Column(children: [
          SafeArea(
            bottom: false,
            child: Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 4, 20, 24),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                    onPressed: () => go(verify ? _Step.signIn : _Step.welcome),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(left: 12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(title, style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(sub, style: const TextStyle(color: Color(0xFFD9CCF5), fontSize: 15)),
                    ]),
                  ),
                ]),
              ),
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
                      children: verify ? _verifyBody() : _formBody(cs, register),
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

  List<Widget> _verifyBody() => [
        const Icon(Icons.mark_email_read_outlined, size: 60, color: conectPurple),
        const SizedBox(height: 16),
        Text(
          'We sent a verification link to ${verificationEmail ?? email.text}. Open it to activate your account, then return here to sign in.',
          textAlign: TextAlign.center,
        ),
        if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, textAlign: TextAlign.center)),
        const SizedBox(height: 20),
        FilledButton(
            onPressed: busy ? null : resendVerification,
            child: Text(busy ? 'Please wait…' : 'Resend verification email')),
        TextButton(onPressed: () => go(_Step.signIn), child: const Text('Back to sign in')),
      ];

  List<Widget> _formBody(ColorScheme cs, bool register) => [
        if (register) ...[
          TextField(
              controller: name,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Full name')),
          const SizedBox(height: 14),
        ],
        TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email')),
        const SizedBox(height: 14),
        if (register) ...[
          TextField(
              controller: phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone number (optional)', hintText: '+234 801 234 5678')),
          const SizedBox(height: 14),
        ],
        TextField(
          controller: pass,
          obscureText: hidePass,
          decoration: InputDecoration(
            labelText: 'Password',
            helperText: register ? 'At least 8 characters' : null,
            suffixIcon: IconButton(
              icon: Icon(hidePass ? Icons.visibility_off_outlined : Icons.visibility_outlined),
              onPressed: () => setState(() => hidePass = !hidePass),
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
              child: const Text('Resend verification email')),
        const SizedBox(height: 20),
        FilledButton(
            onPressed: busy ? null : submit,
            child: Text(busy ? 'Please wait…' : register ? 'Create Account' : 'Sign In')),
        const SizedBox(height: 8),
        TextButton(
            onPressed: () => go(register ? _Step.signIn : _Step.register),
            child: Text(register ? 'I already have an account' : "Don't have an account? Sign Up")),
        if (register)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('By creating an account, you agree to our Terms & Conditions and Privacy Policy.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 12)),
          ),
      ];
}
