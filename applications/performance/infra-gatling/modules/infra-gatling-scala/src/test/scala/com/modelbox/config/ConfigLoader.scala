package com.modelbox.config

import com.modelbox.shared.RuntimeDefaults

import scala.io.Source
import scala.util.Using
import scala.collection.mutable
import scala.jdk.CollectionConverters._

/**
 * Generic configuration loader supporting both properties and YAML files.
 * Can be used across any module/model by specifying appropriate config files.
 *
 * Configuration load order (later overrides earlier):
 * 1. application.yml (or application.properties)
 * 2. application-{profile}.yml (if profile is set via PROFILE env var)
 * 3. System properties (highest priority)
 */
object ConfigLoader {
  private val config = mutable.Map[String, String]()
  private val PROFILE_ENV_VAR = RuntimeDefaults.APP_PROFILE_ENV_VAR

  init()

  private def init(): Unit = {
    val profile = System.getenv(PROFILE_ENV_VAR).stripOption.getOrElse(RuntimeDefaults.DEFAULT_PROFILE)

    // Load default configuration
    loadYamlFile("application.yml").foreach { case (k, v) => config(k) = v }
    loadPropertiesFile("application.properties").foreach { case (k, v) => config(k) = v }

    // Load profile-specific configuration (overrides defaults)
    loadYamlFile(s"application-${profile}.yml").foreach { case (k, v) => config(k) = v }
    loadPropertiesFile(s"application-${profile}.properties").foreach { case (k, v) => config(k) = v }

    // System properties take precedence (allow overrides)
    System.getProperties.forEach { (k, v) =>
      config(k.toString) = v.toString
    }
  }

  private def loadYamlFile(filename: String): Map[String, String] = {
    try {
      val resource = getClass.getClassLoader.getResourceAsStream(filename)
      if (resource == null) return Map()

      Using(resource) { is =>
        Using(Source.fromInputStream(is)) { source =>
          val lines = source.getLines().toList
          parseYaml(lines)
        }
      }.flatten.getOrElse(Map())
    } catch {
      case _: Exception => Map()
    }
  }

  private def loadPropertiesFile(filename: String): Map[String, String] = {
    try {
      val resource = getClass.getClassLoader.getResourceAsStream(filename)
      if (resource == null) return Map()

      Using(resource) { is =>
        val props = new java.util.Properties()
        props.load(is)
        props.stringPropertyNames().asScala.iterator
          .map(name => name -> props.getProperty(name))
          .toMap
      }.getOrElse(Map())
    } catch {
      case _: Exception => Map()
    }
  }

  private def parseYaml(lines: List[String]): Map[String, String] = {
    val result = mutable.Map[String, String]()
    var currentPrefix = ""

    lines.foreach { line =>
      val trimmed = line.trim
      if (trimmed.nonEmpty && !trimmed.startsWith("#")) {
        if (line.startsWith("  ")) {
          // Nested value (property)
          val keyValue = trimmed.split(":", 2)
          if (keyValue.length == 2) {
            val key = s"${currentPrefix}${keyValue(0).trim}"
            val value = keyValue(1).trim
            result(key) = value
          }
        } else {
          // Top-level key (section)
          val keyValue = trimmed.split(":", 2)
          if (keyValue.length >= 1) {
            currentPrefix = keyValue(0).trim + "."
          }
        }
      }
    }

    result.toMap
  }

  /**
   * Get a string configuration value with default fallback
   */
  def getString(key: String, default: String): String = {
    config.getOrElse(key, default)
  }

  /**
   * Get an integer configuration value with default fallback
   */
  def getInt(key: String, default: Int): Int = {
    config.get(key).flatMap(v => scala.util.Try(v.toInt).toOption).getOrElse(default)
  }

  /**
   * Get a boolean configuration value with default fallback
   */
  def getBoolean(key: String, default: Boolean): Boolean = {
    config.get(key).flatMap(v => scala.util.Try(v.toBoolean).toOption).getOrElse(default)
  }

  /**
   * Get all loaded configuration as a read-only map
   */
  def getAll: Map[String, String] = config.toMap

  /**
   * Check if a configuration key exists
   */
  def contains(key: String): Boolean = config.contains(key)

  /**
   * Get the currently active profile
   */
  def getActiveProfile: String = System.getenv(PROFILE_ENV_VAR).stripOption.getOrElse(RuntimeDefaults.DEFAULT_PROFILE)
}

implicit class StringOption(val s: String) extends AnyVal {
  def stripOption: Option[String] = Option(s).filter(_.nonEmpty)
}
