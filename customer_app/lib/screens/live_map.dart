import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

/// Courier position (and the delivery address, when known) on an OpenStreetMap map.
class LiveMap extends StatefulWidget {
  final LatLng courier;
  final LatLng? destination;
  const LiveMap({super.key, required this.courier, this.destination});
  @override
  State<LiveMap> createState() => _LiveMapState();
}

class _LiveMapState extends State<LiveMap> {
  final controller = MapController();
  bool ready = false;

  void fit() {
    if (!ready) return;
    final d = widget.destination;
    if (d == null) {
      controller.move(widget.courier, controller.camera.zoom);
    } else {
      controller.fitCamera(CameraFit.bounds(
        bounds: LatLngBounds.fromPoints([widget.courier, d]),
        padding: const EdgeInsets.all(56),
        maxZoom: 17,
      ));
    }
  }

  @override
  void didUpdateWidget(LiveMap old) {
    super.didUpdateWidget(old);
    if (old.courier != widget.courier) WidgetsBinding.instance.addPostFrameCallback((_) => fit());
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return SizedBox(
      height: 240,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: FlutterMap(
          mapController: controller,
          options: MapOptions(
            initialCenter: widget.courier,
            initialZoom: 15,
            onMapReady: () { ready = true; fit(); },
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.example.conect_app',
            ),
            MarkerLayer(markers: [
              Marker(point: widget.courier, width: 44, height: 44,
                  child: Icon(Icons.two_wheeler, size: 34, color: cs.primary)),
              if (widget.destination != null)
                Marker(point: widget.destination!, width: 44, height: 44,
                    child: Icon(Icons.home, size: 34, color: cs.error)),
            ]),
            const RichAttributionWidget(attributions: [TextSourceAttribution('OpenStreetMap contributors')]),
          ],
        ),
      ),
    );
  }
}
