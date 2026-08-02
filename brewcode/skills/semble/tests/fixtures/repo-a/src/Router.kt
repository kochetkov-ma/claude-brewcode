package fixtures.repoa

/** Minimal request router used as a Kotlin coverage fixture. */
class Router(private val routes: Map<String, (String) -> String>) {

    fun handle(path: String, body: String): String {
        val handler = routes[path] ?: return "404 not found"
        return handler(body)
    }

    fun paths(): List<String> = routes.keys.sorted()
}
