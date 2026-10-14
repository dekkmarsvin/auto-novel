package infra.provider.providers

import koinExtensions
import infra.web.datasource.WebNovelHttpDataSource
import infra.web.datasource.providers.Nailain
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.shouldBe
import kotlinx.datetime.Instant
import org.koin.test.KoinTest
import org.koin.test.inject

// 需要环境变量 NAILAIN_PASSWORD（每月轮换的合言葉）
class NailainTest : DescribeSpec(), KoinTest {
    override fun extensions() = koinExtensions()
    private val dataSource by inject<WebNovelHttpDataSource>()
    private val provider get() = dataSource.providers[Nailain.id]!!

    init {
        if (System.getenv("NAILAIN_PASSWORD") != null) tests()
    }

    private fun tests() {
        describe("getMetadata") {
            it("常规") {
                // https://nailain.alwaysdata.net/posts/12612524
                val metadata = provider.getMetadata("12612524")
                metadata.title.shouldBe("腹黒の男の子に寝取られる話 その4")
                metadata.keywords.shouldContain("寝取られ")
                metadata.toc.size.shouldBe(1)
                metadata.toc[0].chapterId.shouldBe("default")
                metadata.toc[0].createAt.shouldBe(Instant.parse("2026-09-16T15:00:00Z"))
            }
        }
        describe("getChapter") {
            it("常规") {
                val chapter = provider.getChapter("12612524", "default")
                chapter.paragraphs.first().shouldBe("翌日、カズヤから再び命令が届いた。")
            }
        }
    }
}
