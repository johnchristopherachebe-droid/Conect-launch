import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../brand.dart';
import '../state.dart';
import '../widgets.dart';
import 'addresses.dart';
import 'orders.dart';
import 'support.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});
  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  bool busy = false;

  void _open(Widget screen) => Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  Future<void> _delete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete your account?'),
        content: const Text('This action cannot be undone. Your account will be deactivated and you will be signed out.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep account')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete account')),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() => busy = true);
    try {
      final result = await context.read<AppState>().api.delete('/account');
      if (!mounted) return;
      await context.read<AppState>().signOut();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result['message'] ?? 'Account deleted.')));
        Navigator.popUntil(context, (r) => r.isFirst);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _tile(IconData icon, String label, VoidCallback onTap, {Color? color}) => Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: ListTile(
          leading: Icon(icon, color: color ?? conectPurple),
          title: Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: color)),
          trailing: const Icon(Icons.chevron_right_rounded),
          onTap: onTap,
        ),
      );

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final name = (s.user?['name'] ?? '').toString();
    final email = s.user?['email']?.toString();
    return GradientPage(
      title: 'Profile',
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: conectPurple,
                child: Text(name.isEmpty ? '?' : name[0].toUpperCase(),
                    style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(name.isEmpty ? 'Your account' : name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                  if (email != null) Text(email, style: TextStyle(color: Theme.of(context).hintColor)),
                ]),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        _tile(Icons.receipt_long_outlined, 'My Orders', () => _open(const OrdersScreen())),
        _tile(Icons.location_on_outlined, 'Addresses', () => _open(const AddressesScreen())),
        _tile(Icons.support_agent_rounded, 'Help & Support', () => _open(const SupportScreen())),
        const SizedBox(height: 8),
        _tile(Icons.logout, 'Sign out', () async {
          await context.read<AppState>().signOut();
          if (context.mounted) Navigator.popUntil(context, (r) => r.isFirst);
        }),
        _tile(Icons.delete_outline, busy ? 'Please wait…' : 'Delete account', busy ? () {} : _delete,
            color: Theme.of(context).colorScheme.error),
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
          child: Text(
            'Deleting your account deactivates it and anonymises your profile. Transaction records may be kept where required for accounting, safety or disputes. Finish or cancel active orders first.',
            style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor),
          ),
        ),
      ]),
    );
  }
}
