import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});
  @override State<AccountScreen> createState() => _AccountScreenState();
}
class _AccountScreenState extends State<AccountScreen> {
  bool busy = false;
  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Account & privacy')),
    body: ListView(padding: const EdgeInsets.all(16), children: [
      const Card(child: Padding(padding: EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Your account', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
        SizedBox(height: 8), Text('Keep your sign-in details private. Email verification is required before you can sign in.'),
      ]))),
      const SizedBox(height: 16),
      const Text('Delete account', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      const SizedBox(height: 6),
      const Text('This deactivates your account and anonymises your profile details. Transaction records may be retained where required for accounting, safety or dispute handling. You must finish or cancel active orders first.'),
      const SizedBox(height: 12),
      OutlinedButton.icon(
        onPressed: busy ? null : () async {
          final confirm = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
            title: const Text('Delete your account?'),
            content: const Text('This action cannot be undone. Your account will be deactivated and you will be signed out.'),
            actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep account')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete account'))],
          ));
          if (confirm != true || !context.mounted) return;
          setState(() => busy = true);
          try {
            final result = await context.read<AppState>().api.delete('/account');
            if (!context.mounted) return;
            await context.read<AppState>().signOut();
            if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result['message'] ?? 'Account deleted.')));
            if (context.mounted) Navigator.pop(context);
          } catch (e) {
            if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
          } finally { if (mounted) setState(() => busy = false); }
        },
        icon: const Icon(Icons.delete_outline),
        label: Text(busy ? 'Please wait…' : 'Request account deletion'),
      ),
    ]),
  );
}
