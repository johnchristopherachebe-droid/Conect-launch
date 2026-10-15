import 'dart:convert';
import 'package:http/http.dart' as http;

/// flutter run --dart-define=API_URL=https://your-server
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000');

class ApiException implements Exception {
  final String message;
  ApiException(this.message);
  @override
  String toString() => message;
}

num n(dynamic v) => num.parse(v.toString());

class Api {
  String? token;

  Future<dynamic> _send(String method, String path, [Object? body]) async {
    final req = http.Request(method, Uri.parse('$apiUrl$path'))..headers['Content-Type'] = 'application/json';
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    if (body != null) req.body = jsonEncode(body);
    try {
      final res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 15)));
      final data = res.body.isEmpty ? null : jsonDecode(res.body);
      if (res.statusCode >= 400) throw ApiException((data is Map ? data['error'] : null) ?? 'Something went wrong');
      return data;
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException('Cannot reach Cönëct. Check your connection and try again.');
    }
  }

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body);
  Future<dynamic> put(String path, Object body) => _send('PUT', path, body);
}
