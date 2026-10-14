package api

import api.plugins.*
import infra.common.SiteSettingRepository
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
            val user = call.user()
            call.tryRespond {
                user.requireAdmin()
                NailainPasswordBody(repo.get(SiteSettingRepository.NAILAIN_PASSWORD) ?: "")
            }
        }
        put<NailainPasswordRes> {
            val user = call.user()
            val body = call.receive<NailainPasswordBody>()
            call.tryRespond {
                user.requireAdmin()
                repo.set(SiteSettingRepository.NAILAIN_PASSWORD, body.password.trim())
            }
        }
    }
}
