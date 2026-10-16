import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});
  @override State<SupportScreen> createState() => _SupportScreenState();
}
class _SupportScreenState extends State<SupportScreen> {
  late Future<dynamic> tickets;
  final subject = TextEditingController(), message = TextEditingController();
  List<Map<String, dynamic>> orders = [];
  String? orderId;
  bool sending = false, ordersLoading = true;
  @override void initState() { super.initState(); tickets = load(); loadOrders(); }
  Future<dynamic> load() => context.read<AppState>().api.get('/support/tickets');
  Future<void> loadOrders() async { try { final result = await context.read<AppState>().api.get('/orders'); if (mounted) setState(() { orders = (result as List).cast<Map<String,dynamic>>(); ordersLoading = false; }); } catch (_) { if (mounted) setState(() => ordersLoading = false); } }
  void refresh() => setState(() => tickets = load());
  Future<void> createTicket() async {
    if (subject.text.trim().length < 3 || message.text.trim().length < 5) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a subject and explain how we can help.'))); return;
    }
    setState(() => sending = true);
    try {
      await context.read<AppState>().api.post('/support/tickets', {'subject': subject.text.trim(), 'message': message.text.trim(), if (orderId != null) 'order_id': orderId});
      if (!mounted) return;
      subject.clear(); message.clear(); setState(() => orderId = null); refresh();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Support request sent. You can open it below to reply.')));
    } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()))); }
    finally { if (mounted) setState(() => sending = false); }
  }
  @override Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Help & support')), body: ListView(padding: const EdgeInsets.all(16), children: [
    Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('How can we help?', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
      TextField(controller: subject, decoration: const InputDecoration(labelText: 'Subject', hintText: 'e.g. Help with my order')),
      TextField(controller: message, minLines: 3, maxLines: 6, decoration: const InputDecoration(labelText: 'Message')),
      const SizedBox(height: 8),
      DropdownButtonFormField<String>(value: orderId, decoration: const InputDecoration(labelText: 'Related order (optional)', border: OutlineInputBorder()), items: [const DropdownMenuItem<String>(value: null, child: Text('No specific order')), ...orders.take(30).map((o) => DropdownMenuItem<String>(value: o['id']?.toString(), child: Text('${o['store_name'] ?? 'Order'} · ${o['status']} · ₦${n(o['total']).toStringAsFixed(0)}', overflow: TextOverflow.ellipsis)))], onChanged: ordersLoading ? null : (v) => setState(() => orderId = v)),
      if (ordersLoading) const Padding(padding: EdgeInsets.only(top: 6), child: LinearProgressIndicator()),
      const SizedBox(height: 12), FilledButton(onPressed: sending ? null : createTicket, child: Text(sending ? 'Sending…' : 'Send support request')),
    ]))),
    const SizedBox(height: 12), const Text('Your support requests', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
    FutureBuilder(future: tickets, builder: (_, snap) {
      if (snap.connectionState != ConnectionState.done) return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
      if (snap.hasError) return Column(children: [Text(snap.error.toString()), TextButton(onPressed: refresh, child: const Text('Try again'))]);
      final rows = (snap.data as List).cast<Map<String, dynamic>>();
      if (rows.isEmpty) return const Padding(padding: EdgeInsets.all(16), child: Text('No support requests yet.'));
            return Column(children: rows.map((t) => Card(child: ListTile(title: Text(t['subject'] ?? 'Support request'), subtitle: Text('${t['status']} · ${t['created_at']}'), trailing: const Icon(Icons.chevron_right), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SupportThread(ticket: t))).then((_) => refresh())))).toList());
    }),
  ]));
}

class SupportThread extends StatefulWidget { final Map<String, dynamic> ticket; const SupportThread({super.key, required this.ticket}); @override State<SupportThread> createState() => _SupportThreadState(); }
class _SupportThreadState extends State<SupportThread> {
  late Future<dynamic> messages; final reply = TextEditingController(); bool sending = false; Timer? poll;
  String get id => widget.ticket['id'].toString();
  @override void initState() { super.initState(); messages = context.read<AppState>().api.get('/support/tickets/$id/messages'); poll = Timer.periodic(const Duration(seconds: 5), (_) => refresh()); }
  @override void dispose() { poll?.cancel(); reply.dispose(); super.dispose(); }
  void refresh() => setState(() => messages = context.read<AppState>().api.get('/support/tickets/$id/messages'));
  Future<void> send() async { if (reply.text.trim().isEmpty) return; setState(() => sending = true); try { await context.read<AppState>().api.post('/support/tickets/$id/messages', {'message': reply.text.trim()}); reply.clear(); refresh(); } catch(e) { if(mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()))); } finally { if(mounted) setState(() => sending = false); } }
  @override Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(widget.ticket['subject'] ?? 'Support thread')), body: Column(children: [Expanded(child: FutureBuilder(future: messages, builder: (_,snap) { if(snap.connectionState!=ConnectionState.done)return const Center(child:CircularProgressIndicator()); if(snap.hasError)return Center(child:Text(snap.error.toString())); final rows=(snap.data as List).cast<Map<String,dynamic>>(); return ListView(padding:const EdgeInsets.all(16),children:[Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('Your request · ${widget.ticket['status']}',style:const TextStyle(fontWeight:FontWeight.bold)),const SizedBox(height:8),Text(widget.ticket['message']??'')]))),...rows.map((m)=>Align(alignment:m['author_role']=='customer'?Alignment.centerRight:Alignment.centerLeft,child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:320),child:Card(color:m['author_role']=='customer'?Theme.of(context).colorScheme.primaryContainer:null,child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(m['author_name']??'Support',style:const TextStyle(fontWeight:FontWeight.bold)),Text(m['message']??'')]))))))]);})), SafeArea(child:Padding(padding:const EdgeInsets.all(12),child:Row(children:[Expanded(child:TextField(controller:reply,minLines:1,maxLines:4,decoration:const InputDecoration(hintText:'Write a reply',border:OutlineInputBorder()))),const SizedBox(width:8),IconButton.filled(onPressed:sending?null:send,icon:const Icon(Icons.send))]))) ]));
}
