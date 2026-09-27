package com.modelbox.config.ollama

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import java.time.Duration

trait OllamaModelResolver {
  def resolve(modelHint: String): String
}

final case class OllamaModelCatalog(name: String)

final class OllamaTagsModelResolver(
    baseUrl: String,
    client: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build(),
    requestTimeout: Duration = Duration.ofSeconds(20)
) extends OllamaModelResolver {

  override def resolve(modelHint: String): String = {
    val trimmedHint = Option(modelHint).map(_.trim).getOrElse("")
    if (trimmedHint.nonEmpty && !trimmedHint.equalsIgnoreCase("auto")) {
      trimmedHint
    } else {
      fetchFirstAvailableModel().getOrElse(
        throw new IllegalStateException(
          s"No Ollama models are available at $baseUrl/api/tags. Ensure at least one model is present in Ollama before running performance tests."
        )
      )
    }
  }

  private def fetchFirstAvailableModel(): Option[String] = {
    val request = HttpRequest.newBuilder(URI.create(s"$baseUrl/api/tags"))
      .timeout(requestTimeout)
      .GET()
      .build()

    val response = send(request)
    if (response.statusCode() / 100 != 2) {
      throw new IllegalStateException(
        s"Unable to read Ollama model list from $baseUrl/api/tags (HTTP ${response.statusCode()})"
      )
    }

    OllamaTagsParser.firstModelName(response.body())
  }

  private def send(request: HttpRequest): HttpResponse[String] = {
    try {
      client.send(request, HttpResponse.BodyHandlers.ofString())
    } catch {
      case interrupted: InterruptedException =>
        Thread.currentThread().interrupt()
        throw new IllegalStateException(s"Interrupted while querying $baseUrl/api/tags", interrupted)
      case exception: Exception =>
        throw new IllegalStateException(s"Failed to query $baseUrl/api/tags", exception)
    }
  }
}

object OllamaTagsParser {
  private val NamePattern = "\"name\"\\s*:\\s*\"([^\"]+)\"".r

  def firstModelName(body: String): Option[String] = {
    NamePattern.findFirstMatchIn(body).map(_.group(1))
  }
}

object OllamaTagsModelResolver {
  def apply(baseUrl: String): OllamaTagsModelResolver = new OllamaTagsModelResolver(baseUrl)
}