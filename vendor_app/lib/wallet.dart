import 'package:flutter/material.dart';
import 'brand.dart';

/// Sends a request to the Cönëct API and returns decoded JSON. Each app passes its own client.
typedef WalletSend = Future<dynamic> Function(String method, String path, [Object? body]);

num _n(dynamic v) => v is num ? v : (num.tryParse('$v') ?? 0);

String _money(dynamic v) {
  final x = _n(v).toDouble();
  final neg = x < 0;
  final fixed = x.abs().toStringAsFixed(2);
  final parts = fixed.split('.');
  final whole = parts[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return '${neg ? '-' : ''}₦$whole.${parts[1]}';
}

String _day(dynamic iso) {
  final d = DateTime.tryParse('$iso')?.toLocal();
  if (d == null) return '';
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '${d.day} ${m[d.month - 1]}, $h:${d.minute.toString().padLeft(2, '0')} ${d.hour >= 12 ? 'pm' : 'am'}';
}

String _cleanErr(Object e) => e.toString().replaceFirst('Exception: ', '').replaceFirst('ApiException: ', '');

const _kindLabels = {
  'order_earning': 'Order earnings',
  'delivery_earning': 'Delivery earnings',
  'refund_reversal': 'Order refunded',
  'refund_reversal_undo': 'Refund reversed',
  'withdrawal': 'Withdrawal',
  'withdrawal_reversal': 'Withdrawal returned',
  'adjustment': 'Adjustment',
};

/// Balance, bank account, withdrawals and history for a vendor or courier.
class WalletView extends StatefulWidget {
  final WalletSend send;
  const WalletView({super.key, required this.send});
  @override
  State<WalletView> createState() => _WalletViewState();
}

class _WalletViewState extends State<WalletView> {
  Map<String, dynamic>? w;
  String error = '';
  bool busy = false;

  @override
  void initState() {
    super.initState();
    load();
  }

  void _msg(String s) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s)));
  }

  Future<void> load() async {
    try {
      final d = await widget.send('GET', '/wallet');
      if (!mounted) return;
      setState(() {
        w = Map<String, dynamic>.from(d as Map);
        error = '';
      });
    } catch (e) {
      if (mounted) setState(() => error = _cleanErr(e));
    }
  }

  Future<void> _editBank() async {
    final cur = w?['payout_account'] as Map?;
    final res = await showDialog<Map<String, String>>(
      context: context,
      builder: (_) => _BankDialog(
        bank: '${cur?['bank_name'] ?? ''}',
        number: '${cur?['account_number'] ?? ''}',
        name: '${cur?['account_name'] ?? ''}',
      ),
    );
    if (res == null) return;
    setState(() => busy = true);
    try {
      await widget.send('PUT', '/wallet/payout-account', res);
      _msg('Bank account saved.');
      await load();
    } catch (e) {
      _msg(_cleanErr(e));
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> _withdraw() async {
    final balance = _n(w?['balance']).toDouble();
    final min = _n(w?['min_withdrawal']).toDouble();
    if (w?['payout_account'] == null) {
      _msg('Add your bank account first.');
      return _editBank();
    }
    final amount = await showDialog<double>(
      context: context,
      builder: (_) => _AmountDialog(balance: balance, min: min, account: Map<String, dynamic>.from(w!['payout_account'] as Map)),
    );
    if (amount == null) return;
    setState(() => busy = true);
    try {
      await widget.send('POST', '/wallet/withdrawals', {'amount': amount});
      _msg('Withdrawal requested. We will pay it into your bank account.');
      await load();
    } catch (e) {
      _msg(_cleanErr(e));
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    if (w == null) {
      return Center(
        child: error.isEmpty
            ? const CircularProgressIndicator()
            : Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(error, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: load, child: const Text('Try again')),
                ]),
              ),
      );
    }
    final d = w!;
    final balance = _n(d['balance']).toDouble();
    final pending = _n(d['pending_withdrawal']).toDouble();
    final min = _n(d['min_withdrawal']).toDouble();
    final acct = d['payout_account'] as Map?;
    final entries = (d['entries'] as List?) ?? [];
    final withdrawals = (d['withdrawals'] as List?) ?? [];
    final canWithdraw = !busy && pending == 0 && balance >= min && balance > 0;
    final scheme = Theme.of(context).colorScheme;

    String? hint;
    if (pending > 0) {
      hint = 'You have ${_money(pending)} waiting to be paid. You can request another withdrawal once it is settled.';
    } else if (balance < min) {
      hint = 'Minimum withdrawal is ${_money(min)}.';
    }

    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Available balance', style: TextStyle(color: scheme.onSurface.withOpacity(.65), fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(_money(balance), style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text('Total earned: ${_money(d['lifetime_earnings'])}', style: TextStyle(color: scheme.onSurface.withOpacity(.65))),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: canWithdraw ? _withdraw : null,
                    icon: const Icon(Icons.account_balance_wallet_outlined),
                    label: const Text('Withdraw'),
                  ),
                ),
                if (hint != null) ...[
                  const SizedBox(height: 8),
                  Text(hint, style: TextStyle(fontSize: 13, color: scheme.onSurface.withOpacity(.7))),
                ],
              ]),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.account_balance_outlined, color: conectPurple),
              title: Text(acct == null ? 'Add bank account' : '${acct['account_name']}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(acct == null ? 'Needed to receive your money' : '${acct['bank_name']} · ${acct['account_number']}'),
              trailing: TextButton(onPressed: busy ? null : _editBank, child: Text(acct == null ? 'Add' : 'Change')),
            ),
          ),
          if (withdrawals.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text('Withdrawals', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            for (final x in withdrawals)
              Card(
                child: ListTile(
                  title: Text(_money(x['amount']), style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(_day(x['created_at'])),
                  trailing: _StatusChip('${x['status']}'),
                ),
              ),
          ],
          const SizedBox(height: 20),
          const Text('History', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          if (entries.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(child: Text('Earnings from delivered orders will show up here.', style: TextStyle(color: scheme.onSurface.withOpacity(.65)))),
            ),
          for (final e in entries)
            Builder(builder: (_) {
              final amt = _n(e['amount']).toDouble();
              final note = '${e['note'] ?? ''}';
              final label = _kindLabels['${e['kind']}'] ?? '${e['kind']}';
              return ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(note.isNotEmpty && e['kind'] == 'adjustment' ? '$note · ${_day(e['created_at'])}' : _day(e['created_at'])),
                trailing: Text(
                  '${amt > 0 ? '+' : ''}${_money(amt)}',
                  style: TextStyle(fontWeight: FontWeight.w800, color: amt > 0 ? const Color(0xFF16A34A) : const Color(0xFFDC2626)),
                ),
              );
            }),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip(this.status);
  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'paid' => ('Paid', const Color(0xFF16A34A)),
      'rejected' => ('Rejected', const Color(0xFFDC2626)),
      _ => ('Waiting', conectOrange),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(.14), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
    );
  }
}

class _BankDialog extends StatefulWidget {
  final String bank, number, name;
  const _BankDialog({required this.bank, required this.number, required this.name});
  @override
  State<_BankDialog> createState() => _BankDialogState();
}

class _BankDialogState extends State<_BankDialog> {
  late final bank = TextEditingController(text: widget.bank);
  late final number = TextEditingController(text: widget.number);
  late final name = TextEditingController(text: widget.name);
  String? err;

  @override
  void dispose() {
    bank.dispose();
    number.dispose();
    name.dispose();
    super.dispose();
  }

  void _save() {
    final b = bank.text.trim(), nu = number.text.trim(), na = name.text.trim();
    if (b.length < 2) return setState(() => err = 'Enter your bank name.');
    if (!RegExp(r'^\d{10}$').hasMatch(nu)) return setState(() => err = 'Account number must be 10 digits.');
    if (na.length < 2) return setState(() => err = 'Enter the account name.');
    Navigator.pop(context, {'bank_name': b, 'account_number': nu, 'account_name': na});
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Bank account'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: bank, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Bank name')),
          const SizedBox(height: 12),
          TextField(controller: number, keyboardType: TextInputType.number, maxLength: 10, decoration: const InputDecoration(labelText: 'Account number', counterText: '')),
          const SizedBox(height: 12),
          TextField(controller: name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Account name')),
          if (err != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(err!, style: const TextStyle(color: Color(0xFFDC2626)))),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: _save, child: const Text('Save')),
      ],
    );
  }
}

class _AmountDialog extends StatefulWidget {
  final double balance, min;
  final Map<String, dynamic> account;
  const _AmountDialog({required this.balance, required this.min, required this.account});
  @override
  State<_AmountDialog> createState() => _AmountDialogState();
}

class _AmountDialogState extends State<_AmountDialog> {
  late final amount = TextEditingController(text: widget.balance.toStringAsFixed(2));
  String? err;

  @override
  void dispose() {
    amount.dispose();
    super.dispose();
  }

  void _go() {
    final v = double.tryParse(amount.text.trim().replaceAll(',', ''));
    if (v == null || v <= 0) return setState(() => err = 'Enter an amount.');
    if ((v * 100 - (v * 100).round()).abs() > 1e-6) return setState(() => err = 'Use at most 2 decimal places.');
    if (v < widget.min) return setState(() => err = 'Minimum is ${_money(widget.min)}.');
    if (v > widget.balance + 1e-9) return setState(() => err = 'That is more than your balance.');
    Navigator.pop(context, double.parse(v.toStringAsFixed(2)));
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.account;
    return AlertDialog(
      title: const Text('Withdraw'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('To: ${a['account_name']}\n${a['bank_name']} · ${a['account_number']}'),
        const SizedBox(height: 14),
        TextField(
          controller: amount,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: 'Amount (₦)', helperText: 'Available ${_money(widget.balance)}'),
        ),
        if (err != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(err!, style: const TextStyle(color: Color(0xFFDC2626)))),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: _go, child: const Text('Request withdrawal')),
      ],
    );
  }
}
