import 'package:flutter/material.dart';

const vendorCategories = {
  'food': 'Food & restaurants',
  'groceries': 'Groceries',
  'pharmacy': 'Pharmacy & health',
  'fashion': 'Fashion',
  'gadgets': 'Phones & gadgets',
  'beauty': 'Beauty & cosmetics',
};

class CategoryPicker extends StatelessWidget {
  final List<String> selected;
  final ValueChanged<List<String>> onChanged;
  const CategoryPicker({super.key, required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('What do you sell? Choose all that apply.', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 4, children: [
          for (final e in vendorCategories.entries)
            FilterChip(
              label: Text(e.value),
              selected: selected.contains(e.key),
              onSelected: (on) {
                final next = [...selected];
                if (on) {
                  next.add(e.key);
                } else {
                  next.remove(e.key);
                }
                onChanged(next);
              },
            ),
        ]),
      ]);
}
