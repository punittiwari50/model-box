package com.modelbox.gatling

import com.modelbox.config.ConfigLoader
import org.slf4j.LoggerFactory
import scala.concurrent.duration._

final case class GatlingWorkloadProfile(
  name: String,
  warmupUsers: Int,
  maxUsers: Int,
  rampDuration: FiniteDuration,
  holdDuration: FiniteDuration,
  requestPause: Int,
  thinkTime: Int
)

/**
 * Centralized Gatling configuration.
 * All property names and defaults are defined here.
 * Actual values are loaded from application*.yml and application*.properties files.
 */
object GatlingConfig {
  private val logger = LoggerFactory.getLogger("com.modelbox.gatling.GatlingConfig")

  // Property name constants
  object Properties {
    val WARM_UP_USERS = "gatling.warmupUsers"
    val MAX_USERS = "gatling.maxUsers"
    val RAMP_DURATION = "gatling.rampDuration"
    val HOLD_DURATION = "gatling.holdDuration"
    val THINK_TIME = "gatling.thinkTime"
    val TIMEOUT = "gatling.timeout"
    val REQUEST_PAUSE = "gatling.requestPause"
  }

  // Default values
  object Defaults {
    val WARM_UP_USERS = 5
    val MAX_USERS = 20
    val RAMP_DURATION = 30
    val HOLD_DURATION = 300 // seconds
    val THINK_TIME = 1000 // milliseconds
    val TIMEOUT = 30 // seconds
    val REQUEST_PAUSE = 500 // milliseconds
  }

  // Load values from config files
  val warmupUsers: Int = ConfigLoader.getInt(Properties.WARM_UP_USERS, Defaults.WARM_UP_USERS)
  val maxUsers: Int = ConfigLoader.getInt(Properties.MAX_USERS, Defaults.MAX_USERS)
  val rampDuration: FiniteDuration = ConfigLoader.getInt(Properties.RAMP_DURATION, Defaults.RAMP_DURATION).seconds
  val holdDuration: FiniteDuration = ConfigLoader.getInt(Properties.HOLD_DURATION, Defaults.HOLD_DURATION).seconds
  val thinkTime: Int = ConfigLoader.getInt(Properties.THINK_TIME, Defaults.THINK_TIME)
  val timeout: Int = ConfigLoader.getInt(Properties.TIMEOUT, Defaults.TIMEOUT)
  val requestPause: Int = ConfigLoader.getInt(Properties.REQUEST_PAUSE, Defaults.REQUEST_PAUSE)

  private val loadProfile = GatlingWorkloadProfile(
    name = "load",
    warmupUsers = readProfileInt("load", Properties.WARM_UP_USERS, warmupUsers),
    maxUsers = readProfileInt("load", Properties.MAX_USERS, maxUsers),
    rampDuration = readProfileInt("load", Properties.RAMP_DURATION, rampDuration.toSeconds.toInt).seconds,
    holdDuration = readProfileInt("load", Properties.HOLD_DURATION, 120).seconds,
    requestPause = readProfileInt("load", Properties.REQUEST_PAUSE, requestPause),
    thinkTime = readProfileInt("load", Properties.THINK_TIME, thinkTime)
  )

  private val stressProfile = GatlingWorkloadProfile(
    name = "stress",
    warmupUsers = readProfileInt("stress", Properties.WARM_UP_USERS, warmupUsers),
    maxUsers = readProfileInt("stress", Properties.MAX_USERS, maxUsers * 2),
    rampDuration = readProfileInt("stress", Properties.RAMP_DURATION, (rampDuration.toSeconds * 2).toInt).seconds,
    holdDuration = readProfileInt("stress", Properties.HOLD_DURATION, 90).seconds,
    requestPause = readProfileInt("stress", Properties.REQUEST_PAUSE, requestPause),
    thinkTime = readProfileInt("stress", Properties.THINK_TIME, thinkTime)
  )

  private val soakProfile = GatlingWorkloadProfile(
    name = "soak",
    warmupUsers = readProfileInt("soak", Properties.WARM_UP_USERS, warmupUsers),
    maxUsers = readProfileInt("soak", Properties.MAX_USERS, maxUsers),
    rampDuration = readProfileInt("soak", Properties.RAMP_DURATION, rampDuration.toSeconds.toInt).seconds,
    holdDuration = readProfileInt("soak", Properties.HOLD_DURATION, 1800).seconds,
    requestPause = readProfileInt("soak", Properties.REQUEST_PAUSE, requestPause),
    thinkTime = readProfileInt("soak", Properties.THINK_TIME, thinkTime)
  )

  private val spikeProfile = GatlingWorkloadProfile(
    name = "spike",
    warmupUsers = readProfileInt("spike", Properties.WARM_UP_USERS, warmupUsers),
    maxUsers = readProfileInt("spike", Properties.MAX_USERS, maxUsers * 3),
    rampDuration = readProfileInt("spike", Properties.RAMP_DURATION, 10).seconds,
    holdDuration = readProfileInt("spike", Properties.HOLD_DURATION, 30).seconds,
    requestPause = readProfileInt("spike", Properties.REQUEST_PAUSE, requestPause),
    thinkTime = readProfileInt("spike", Properties.THINK_TIME, thinkTime)
  )

  private val profiles = Map(
    loadProfile.name -> loadProfile,
    stressProfile.name -> stressProfile,
    soakProfile.name -> soakProfile,
    spikeProfile.name -> spikeProfile
  )

  def resolveProfile(profileName: String): GatlingWorkloadProfile = {
    val normalized = Option(profileName).map(_.trim.toLowerCase).filter(_.nonEmpty).getOrElse("load")
    profiles.getOrElse(normalized, loadProfile)
  }

  private def readProfileInt(profileName: String, key: String, fallback: Int): Int = {
    val profileKey = s"gatling.profile.$profileName.${key.stripPrefix("gatling.")}" 
    ConfigLoader.getInt(profileKey, fallback)
  }

  /**
   * Print active configuration (useful for debugging)
   */
  def printConfig(): Unit = {
    logger.info("=== Gatling Configuration ===")
    logger.info(s"Profile: ${ConfigLoader.getActiveProfile}")
    logger.info(s"Warm-up users: $warmupUsers")
    logger.info(s"Max users: $maxUsers")
    logger.info(s"Ramp duration: $rampDuration")
    logger.info(s"Hold duration: $holdDuration")
    logger.info(s"Think time: ${thinkTime}ms")
    logger.info(s"Timeout: ${timeout}s")
    logger.info(s"Request pause: ${requestPause}ms")
    logger.info("Profiles:")
    profiles.values.toList.sortBy(_.name).foreach { profile =>
      logger.info(
        s"  ${profile.name}: warmup=${profile.warmupUsers}, max=${profile.maxUsers}, ramp=${profile.rampDuration.toSeconds}s, hold=${profile.holdDuration.toSeconds}s, think=${profile.thinkTime}ms, pause=${profile.requestPause}ms"
      )
    }
    logger.info("==============================")
  }
}
