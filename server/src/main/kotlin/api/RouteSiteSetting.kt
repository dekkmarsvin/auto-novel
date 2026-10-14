package api

import api.plugins.*
import infra.common.SiteSettingRepository
import io.ktor.server.application.*
import io.ktor.http.*
import io.ktor.server.response.*
import io.ktor.resources.*
import io.ktor.server.request.*
import io.ktor.server.resources.*
import io.ktor.server.resources.put
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import org.koin.ktor.ext.inject

@Resource("/site-setting/nailain-password")
private class NailainPasswordRes

@Serializable
private class NailainPasswordBody(val password: String)

fun Route.routeSiteSetting() {
    val repo by inject<SiteSettingRepository>()

    authenticateDb {
        get<NailainPasswordRes> {
            call.response.header(HttpHeaders.CacheControl, "no-store")
            val user = call.user()
            call.respondSetting {
                user.requireAdmin()
                NailainPasswordBody(repo.get(SiteSettingRepository.NAILAIN_PASSWORD) ?: "")
            }
        }
        put<NailainPasswordRes> {
            call.response.header(HttpHeaders.CacheControl, "no-store")
            val user = call.user()

            call.respondSetting {
                user.requireAdmin()
                val body = call.receive<NailainPasswordBody>()
                repo.set(SiteSettingRepository.NAILAIN_PASSWORD, body.password.trim())
            }
        }
    }
}

// Database exceptions can contain command documents. Do not log/return their messages here.
private suspend inline fun <reified T : Any> ApplicationCall.respondSetting(block: () -> T) {
    try {
        val result = block()
        if (result is Unit) response.status(HttpStatusCode.OK) else respond(result)
    } catch (e: HttpException) {
        respond(e.status, e.message)
    } catch (_: Exception) {
        respond(HttpStatusCode.InternalServerError, "站点设置操作失败")
    }
}
