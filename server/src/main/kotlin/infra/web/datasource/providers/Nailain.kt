package infra.web.datasource.providers

import infra.common.Page
import infra.common.emptyPage
import infra.web.WebNovelAttention
import infra.web.WebNovelAuthor
import infra.web.WebNovelType
import io.ktor.client.*
import io.ktor.client.plugins.*
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.http.*
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

// 站点以每月轮换的合言葉保护，登录后的 na_session cookie 由 client 的 HttpCookies 保存。
class Nailain(
    private val client: HttpClient,
    private val password: String?,
) : WebNovelProvider {
    companion object {
        const val id = "nailain"
        private const val BASE_URL = "https://nailain.alwaysdata.net"
    }

    override suspend fun getRank(options: Map<String, String>): Page<RemoteNovelListItem> {
        return emptyPage()
    }

    override suspend fun getMetadata(novelId: String): RemoteNovelMetadata {
        val post = getPost(novelId)
        val title = post.string("title")
        return RemoteNovelMetadata(
            title = title,
            authors = listOf(WebNovelAuthor("NAILAIN", "https://nailain.fanbox.cc/")),
            type = WebNovelType.短篇,
            attentions = listOf(WebNovelAttention.R18),
            keywords = listOf(post.string("category")) +
                    post.array("tags").map { it.jsonPrimitive.content },
            points = null,
            totalCharacters = post.int("characters"),
            introduction = post.string("body").take(200).trim(),
            toc = listOf(
                RemoteNovelMetadata.TocItem(
                    title = title,
                    chapterId = "default",
                    createAt = parseJapanDateString("yyyyMMdd", post.string("date")),
                )
            ),
        )
    }

    override suspend fun getChapter(novelId: String, chapterId: String): RemoteChapter {
        return RemoteChapter(paragraphs = getPost(novelId).string("body").split("\n"))
    }

    private suspend fun getPost(novelId: String): JsonObject {
        val url = "$BASE_URL/api/posts/${novelId.encodeURLPathPart()}"
        return try {
            client.get(url).json()
        } catch (e: ClientRequestException) {
            if (e.response.status != HttpStatusCode.Unauthorized) throw e
            login()
            client.get(url).json()
        }
    }

    private suspend fun login() {
        if (password.isNullOrEmpty()) {
            throw NovelAccessDeniedException()
        }
        // 成功时返回 303 并设置 cookie（POST 的 303 不会被自动跟随），失败为 401
        val status = client.submitForm(
            url = "$BASE_URL/login",
            formParameters = parameters {
                append("password", password)
                append("next", "/")
            },
        ) { expectSuccess = false }.status
        if (status == HttpStatusCode.Unauthorized) {
            throw WebNovelProviderException("NAILAIN 合言葉错误，请更新 NAILAIN_PASSWORD")
        }
        if (status != HttpStatusCode.SeeOther && !status.isSuccess()) {
            throw WebNovelProviderException("NAILAIN 登录失败：$status")
        }
    }
}
