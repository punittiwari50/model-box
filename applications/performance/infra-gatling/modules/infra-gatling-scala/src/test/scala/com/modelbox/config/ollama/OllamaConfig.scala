package com.modelbox.config.ollama

import com.modelbox.config.ConfigLoader
import org.slf4j.LoggerFactory

/**
 * Ollama-specific configuration.
 * All Ollama property names and defaults are centralized here.
 */
object OllamaConfig {
  private val logger = LoggerFactory.getLogger("com.modelbox.config.ollama.OllamaConfig")

  // Property name constants
  object Properties {
    val BASE_URL = "ollama.baseUrl"
    val MODEL = "ollama.model"
    val TIMEOUT = "ollama.timeout"
    val RETRIES = "ollama.retries"
  }

  // Default values
  object Defaults {
    val BASE_URL = "http://127.0.0.1:11435"
    val MODEL = "auto"
    val TIMEOUT = 60 // seconds
    val RETRIES = 3
  }

  // Load values from config files
  val baseUrl: String = ConfigLoader.getString(Properties.BASE_URL, Defaults.BASE_URL)
  val configuredModel: String = ConfigLoader.getString(Properties.MODEL, Defaults.MODEL)
  lazy val model: String = OllamaTagsModelResolver(baseUrl).resolve(configuredModel)
  val timeout: Int = ConfigLoader.getInt(Properties.TIMEOUT, Defaults.TIMEOUT)
  val retries: Int = ConfigLoader.getInt(Properties.RETRIES, Defaults.RETRIES)

  /**
   * Print active configuration (useful for debugging)
   */
  def printConfig(): Unit = {
    logger.info("=== Ollama Configuration ===")
    logger.info(s"Base URL: $baseUrl")
    logger.info(s"Configured model hint: $configuredModel")
    logger.info(s"Resolved model: $model")
    logger.info(s"Timeout: ${timeout}s")
    logger.info(s"Retries: $retries")
    logger.info("============================")
  }
}
