package api

import api.plugins.*
import infra.common.ThemeGlossaryRepository
import io.ktor.resources.*
import io.ktor.server.request.*
import io.ktor.server.resources.*
import io.ktor.server.resources.post
import io.ktor.server.resources.put
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId
import org.koin.ktor.ext.inject

@Resource("/theme-glossary")
private class ThemeGlossaryRes {
    @Resource("")
    class List(val parent: ThemeGlossaryRes)

    @Resource("/{id}")
    class Id(val parent: ThemeGlossaryRes, val id: String)
}

fun Route.routeThemeGlossary() {
    val service by inject<ThemeGlossaryApi>()

    authenticateDb {
        get<ThemeGlossaryRes.List> {
            val user = call.user()
            call.tryRespond {
                service.list(user)
            }
        }
        post<ThemeGlossaryRes> {
            val user = call.user()
            val body = call.receive<ThemeGlossaryApi.CreateBody>()
            call.tryRespond {
                service.create(user, body)
            }
        }
        put<ThemeGlossaryRes.Id> { loc ->
            val user = call.user()
            val body = call.receive<ThemeGlossaryApi.UpdateBody>()
            call.tryRespond {
                service.update(user, loc.id, body)
            }
        }
        delete<ThemeGlossaryRes.Id> { loc ->
            val user = call.user()
            call.tryRespond {
                service.delete(user, loc.id)
            }
        }
    }
}

class ThemeGlossaryApi(
    private val repo: ThemeGlossaryRepository,
) {
    @Serializable
    data class ThemeGlossaryDto(
        val id: String,
        val name: String,
        val glossary: Map<String, String>,
        val authorUsername: String,
        val createAt: Long,
        val updateAt: Long,
    )

    suspend fun list(user: User): kotlin.collections.List<ThemeGlossaryDto> {
        return repo.listAll().map {
            ThemeGlossaryDto(
                id = it.id.toHexString(),
                name = it.name,
                glossary = it.glossary,
                authorUsername = it.authorUsername,
                createAt = it.createAt.toEpochMilliseconds(),
                updateAt = it.updateAt.toEpochMilliseconds(),
            )
        }
    }

    @Serializable
    class CreateBody(
        val name: String,
        val glossary: Map<String, String>,
    )

    suspend fun create(user: User, body: CreateBody): String {
        user.requireNovelAccess()
        val created = repo.create(
            name = body.name,
            authorId = ObjectId(user.id),
            authorUsername = user.username,
            glossary = body.glossary,
        )
        return created.id.toHexString()
    }

    @Serializable
    class UpdateBody(
        val name: String,
        val glossary: Map<String, String>,
    )

    suspend fun update(user: User, id: String, body: UpdateBody) {
        user.requireNovelAccess()
        val authorId = if (user.role == UserRole.Admin) null else ObjectId(user.id)
        val success = repo.update(
            id = id,
            authorId = authorId,
            name = body.name,
            glossary = body.glossary,
        )
        if (!success) {
            throwNotFound("找不到該主題術語表或無權限編輯")
        }
    }

    suspend fun delete(user: User, id: String) {
        user.requireNovelAccess()
        val authorId = if (user.role == UserRole.Admin) null else ObjectId(user.id)
        val success = repo.delete(id = id, authorId = authorId)
        if (!success) {
            throwNotFound("找不到該主題術語表或無權限刪除")
        }
    }
}
