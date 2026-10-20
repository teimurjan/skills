import Foundation

enum HTTPError: Error, Equatable {
    case transport(String)
    case status(code: Int, message: String)
    case decoding(String)
}

/// JSON GET, POST and DELETE — the only network shapes this app needs.
struct HTTPClient: Sendable {
    var session: URLSession = .shared

    func get<Response: Decodable>(
        _ url: URL,
        headers: [String: String],
        as _: Response.Type
    ) async throws(HTTPError) -> Response {
        var request = URLRequest(url: url)
        for (field, value) in headers { request.setValue(value, forHTTPHeaderField: field) }
        return try await send(request)
    }

    func delete<Response: Decodable>(
        _ url: URL,
        headers: [String: String],
        as _: Response.Type
    ) async throws(HTTPError) -> Response {
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        for (field, value) in headers { request.setValue(value, forHTTPHeaderField: field) }
        return try await send(request)
    }

    func post<Body: Encodable, Response: Decodable>(
        _ url: URL,
        body: Body,
        headers: [String: String],
        as _: Response.Type
    ) async throws(HTTPError) -> Response {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        for (field, value) in headers { request.setValue(value, forHTTPHeaderField: field) }

        do {
            request.httpBody = try JSONCoding.encoder.encode(body)
        } catch {
            throw .decoding(error.localizedDescription)
        }

        return try await send(request)
    }

    private func send<Response: Decodable>(_ request: URLRequest) async throws(HTTPError) -> Response {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw .transport(error.localizedDescription)
        }

        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200 ..< 300).contains(code) else {
            throw .status(code: code, message: String(data: data, encoding: .utf8) ?? "")
        }
        do {
            return try JSONCoding.decoder.decode(Response.self, from: data)
        } catch {
            throw .decoding(error.localizedDescription)
        }
    }
}
