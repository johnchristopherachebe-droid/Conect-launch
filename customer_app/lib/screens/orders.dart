import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';
import 'tracking.dart';

class OrdersScreen extends StatelessWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My orders')),
      body: FutureBuilder(
        future: context.read<AppState>().api.get('/orders'),
        builder: (_, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) return Center(child: Text(snap.error.toString()));
          final list = (snap.data as List).cast<Map<String, dynamic>>();
          if (list.isEmpty) return const Center(child: Text('No orders yet. Your first one will show up here.'));
          return ListView(children: [
            for (final o in list)
              ListTile(
                title: Text(o['store_name']),
                subtitle: Text('${o['status'].toString().replaceAll('_', ' ')} · ₦${n(o['total']).toStringAsFixed(0)}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TrackingScreen(orderId: o['id']))),
              ),
          ]);
        },
      ),
    );
  }
}
