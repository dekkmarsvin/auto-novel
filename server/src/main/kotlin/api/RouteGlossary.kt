package api

import api.plugins.authenticateDb
import api.plugins.shouldBeAtLeast
import api.plugins.shouldBeOldAss
import api.plugins.user
import infra.glossary.TagGlossary
import infra.glossary.TagGlossaryRepository
import infra.user.UserDbModel
import infra.user.UserRole
import io.ktor.resources.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.resources.*
import io.ktor.server.resources.delete
import io.ktor.server.resources.post
import io.ktor.server.resources.put
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId
import org.koin.ktor.ext.inject

@Resource("/tag-glossary")
private class TagGlossaryRes {
    @Resource("")
    class List(val parent: TagGlossaryRes, val tag: String? = null)

    @Resource("/{id}")
    class Id(val parent: TagGlossaryRes, val id: String)
}

fun Route.routeTagGlossary() {
    val api by inject<TagGlossaryApi>()

    authenticateDb {
        get<TagGlossaryRes.List> { loc ->
            val user = call.user()
            call.tryRespond { api.list(user, loc.tag) }
        }
        post<TagGlossaryRes.List> { _ ->
            val user = call.user()
            val body = call.receive<TagGlossaryApi.CreateBody>()
            call.tryRespond { api.create(user, body) }
        }
        put<TagGlossaryRes.Id> { loc ->
            val user = call.user()
            val body = call.receive<TagGlossaryApi.UpdateBody>()
            call.tryRespond { api.update(user, loc.id, body) }
        }
        delete<TagGlossaryRes.Id> { loc ->
            val user = call.user()
            call.tryRespond { api.delete(user, loc.id) }
        }
    }
}

class TagGlossaryApi(private val repo: TagGlossaryRepository) {
    @Serializable
    data class TagGlossaryDto(
        val id: String,
        val tag: String,
        val glossary: Map<String, String>,
        val adminOnly: Boolean,
    )

    suspend fun list(user: UserDbModel, tag: String?): List<TagGlossaryDto> {
        user.shouldBeAtLeast(UserRole.Admin)
        return repo.list(tag).map {
            TagGlossaryDto(
                id = it.id.toHexString(),
                tag = it.tag,
                glossary = it.glossary,
                adminOnly = it.adminOnly,
            )
        }
    }

    @Serializable
    data class CreateBody(
        val tag: String,
        val glossary: Map<String, String>,
        val adminOnly: Boolean = false,
    )

    suspend fun create(user: UserDbModel, body: CreateBody): String {
        user.shouldBeAtLeast(UserRole.Admin)
        return repo.create(body.tag, body.glossary, body.adminOnly).toHexString()
    }

    @Serializable
    data class UpdateBody(
        val glossary: Map<String, String>,
        val adminOnly: Boolean? = null,
    )

    suspend fun update(user: UserDbModel, id: String, body: UpdateBody) {
        val g = repo.get(id) ?: return
        if (g.adminOnly) {
            user.shouldBeAtLeast(UserRole.Admin)
        } else {
            user.shouldBeAtLeast(UserRole.Admin)
        }
        repo.update(id, body.glossary, body.adminOnly)
    }

    suspend fun delete(user: UserDbModel, id: String) {
        val g = repo.get(id) ?: return
        if (g.adminOnly) {
            user.shouldBeAtLeast(UserRole.Admin)
        } else {
            user.shouldBeAtLeast(UserRole.Admin)
        }
        repo.delete(id)
    }

    suspend fun listByTags(tags: List<String>): List<Map<String, String>> =
        repo.listByTags(tags).map { it.glossary }
}
