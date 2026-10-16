import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../brand.dart';
import '../state.dart';
import '../widgets.dart';

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});
  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  late Future<dynamic> tickets;
  final subject = TextEditingController(), message = TextEditingController();
  List<Map<String, dynamic>> orders = [];
  String? orderId;
  bool sending = false, ordersLoading = true;

  @override
  void initState() {
    super.initState();
    tickets = load();
    loadOrders();
  }

  @override
  void dispose() {
    subject.dispose();
    message.dispose();
    super.dispose();
  }

  Future<dynamic> load() => context.read<AppState>().api.get('/support/tickets');

  Future<void> loadOrders() async {
    try {
      final result = await context.read<AppState>().api.get('/orders');
      if (mounted) setState(() { orders = (result as List).cast<Map<String, dynamic>>(); ordersLoading = false; });
    } catch (_) {
      if (mounted) setState(() => ordersLoading = false);
    }
  }

  void refresh() => setState(() => tickets = load());

  Future<void> createTicket() async {
    if (subject.text.trim().length < 3 || message.text.trim().length < 5) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a subject and explain how we can help.')));
      return;
    }
    setState(() => sending = true);
    try {
      await context.read<AppState>().api.post('/support/tickets',
          {'subject': subject.text.trim(), 'message': message.text.trim(), if (orderId != null) 'order_id': orderId});
      if (!mounted) return;
      subject.clear();
      message.clear();
      setState(() => orderId = null);
      refresh();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Support request sent. You can open it below to reply.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => GradientPage(
        title: 'Help & Support',
        subtitle: 'How can we help you?',
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('Send us a message', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 12),
                TextField(controller: subject, decoration: const InputDecoration(labelText: 'Subject', hintText: 'e.g. Help with my order')),
                const SizedBox(height: 12),
                TextField(controller: message, minLines: 3, maxLines: 6, decoration: const InputDecoration(labelText: 'Message')),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: orderId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Related order (optional)'),
                  items: [
                    const DropdownMenuItem<String>(value: null, child: Text('No specific order')),
                    ...orders.take(30).map((o) => DropdownMenuItem<String>(
                        value: o['id']?.toString(),
                        child: Text('${o['store_name'] ?? 'Order'} · ${o['status']} · ₦${n(o['total']).toStringAsFixed(0)}',
                            overflow: TextOverflow.ellipsis))),
                  ],
                  onChanged: ordersLoading ? null : (v) => setState(() => orderId = v),
                ),
                if (ordersLoading) const Padding(padding: EdgeInsets.only(top: 6), child: LinearProgressIndicator()),
                const SizedBox(height: 16),
                FilledButton(onPressed: sending ? null : createTicket, child: Text(sending ? 'Sending…' : 'Send support request')),
              ]),
            ),
          ),
          const SizedBox(height: 20),
          const Text('Your support requests', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          FutureBuilder(
            future: tickets,
            builder: (_, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
              }
              if (snap.hasError) {
                return Column(children: [Text(snap.error.toString()), TextButton(onPressed: refresh, child: const Text('Try again'))]);
              }
              final rows = (snap.data as List).cast<Map<String, dynamic>>();
              if (rows.isEmpty) return const Padding(padding: EdgeInsets.all(16), child: Text('No support requests yet.'));
              return Column(children: [
                for (final t in rows)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: const Icon(Icons.chat_bubble_outline_rounded, color: conectPurple),
                      title: Text(t['subject'] ?? 'Support request', style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text('${t['status']}'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SupportThread(ticket: t))).then((_) => refresh()),
                    ),
                  ),
              ]);
            },
          ),
        ]),
      );
}

class SupportThread extends StatefulWidget {
  final Map<String, dynamic> ticket;
  const SupportThread({super.key, required this.ticket});
  @override
  State<SupportThread> createState() => _SupportThreadState();
}

class _SupportThreadState extends State<SupportThread> {
  List<Map<String, dynamic>>? rows;
  String? error;
  final reply = TextEditingController();
  bool sending = false;
  Timer? poll;

  String get id => widget.ticket['id'].toString();

  @override
  void initState() {
    super.initState();
    refresh();
    poll = Timer.periodic(const Duration(seconds: 5), (_) => refresh());
  }

  @override
  void dispose() {
    poll?.cancel();
    reply.dispose();
    super.dispose();
  }

  Future<void> refresh() async {
    try {
      final r = await context.read<AppState>().api.get('/support/tickets/$id/messages');
      if (mounted) setState(() { rows = (r as List).cast<Map<String, dynamic>>(); error = null; });
    } catch (e) {
      if (mounted && rows == null) setState(() => error = e.toString());
    }
  }

  Future<void> send() async {
    if (reply.text.trim().isEmpty) return;
    setState(() => sending = true);
    try {
      await context.read<AppState>().api.post('/support/tickets/$id/messages', {'message': reply.text.trim()});
      reply.clear();
      await refresh();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  Widget _bubble(BuildContext context, Map<String, dynamic> m) {
    final mine = m['author_role'] == 'customer';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 320),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: mine ? conectPurple : conectLavender,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(m['author_name'] ?? 'Support',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: mine ? const Color(0xFFE4D9FF) : conectPurple)),
            const SizedBox(height: 2),
            Text(m['message'] ?? '', style: TextStyle(color: mine ? Colors.white : const Color(0xFF1B1030))),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => GradientPage(
        title: widget.ticket['subject'] ?? 'Support thread',
        subtitle: 'Status: ${widget.ticket['status']}',
        bottomBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Expanded(child: TextField(controller: reply, minLines: 1, maxLines: 4, decoration: const InputDecoration(hintText: 'Write a reply'))),
              const SizedBox(width: 8),
              IconButton.filled(onPressed: sending ? null : send, icon: const Icon(Icons.send_rounded)),
            ]),
          ),
        ),
        child: rows == null
            ? Center(child: error == null ? const CircularProgressIndicator() : Padding(padding: const EdgeInsets.all(24), child: Text(error!)))
            : ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 16), children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Your request', style: TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 6),
                      Text(widget.ticket['message'] ?? ''),
                    ]),
                  ),
                ),
                const SizedBox(height: 10),
                for (final m in rows!) _bubble(context, m),
              ]),
      );
}
