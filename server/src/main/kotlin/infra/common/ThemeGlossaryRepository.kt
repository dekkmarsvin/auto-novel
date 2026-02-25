package infra.common

import com.mongodb.client.model.Filters.and
import com.mongodb.client.model.Filters.eq
import com.mongodb.client.model.Updates.combine
import com.mongodb.client.model.Updates.set
import infra.MongoClient
import infra.MongoCollectionNames
import infra.field
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.toList
import kotlinx.datetime.Clock
import org.bson.types.ObjectId

class ThemeGlossaryRepository(
    mongo: MongoClient,
) {
    private val themeGlossaryCollection =
        mongo.database.getCollection<ThemeGlossary>(
            MongoCollectionNames.THEME_GLOSSARY,
        )

    suspend fun create(
        name: String,
        authorId: ObjectId,
        authorUsername: String,
        glossary: Map<String, String>,
    ): ThemeGlossary {
        val themeGlossary = ThemeGlossary(
            id = ObjectId(),
            name = name,
            authorId = authorId,
            authorUsername = authorUsername,
            glossary = glossary,
        )
        themeGlossaryCollection.insertOne(themeGlossary)
        return themeGlossary
    }

    suspend fun get(id: String): ThemeGlossary? {
        return themeGlossaryCollection
            .find(eq(ThemeGlossary::id.field(), ObjectId(id)))
            .firstOrNull()
    }

    suspend fun listAll(): List<ThemeGlossary> {
        return themeGlossaryCollection
            .find()
            .toList()
    }

    suspend fun listAllByAuthor(authorId: ObjectId): List<ThemeGlossary> {
        return themeGlossaryCollection
            .find(eq(ThemeGlossary::authorId.field(), authorId))
            .toList()
    }

    suspend fun update(
        id: String,
        authorId: ObjectId?, // null = admin bypass, no author check
        name: String?,
        glossary: Map<String, String>?,
    ): Boolean {
        val updates = mutableListOf(
            set(ThemeGlossary::updateAt.field(), Clock.System.now())
        )
        if (name != null) {
            updates.add(set(ThemeGlossary::name.field(), name))
        }
        if (glossary != null) {
            updates.add(set(ThemeGlossary::glossary.field(), glossary))
        }

        val filter = if (authorId != null) {
            and(
                eq(ThemeGlossary::id.field(), ObjectId(id)),
                eq(ThemeGlossary::authorId.field(), authorId)
            )
        } else {
            eq(ThemeGlossary::id.field(), ObjectId(id))
        }

        val result = themeGlossaryCollection.updateOne(filter, combine(updates))
        return result.modifiedCount > 0
    }

    suspend fun delete(id: String, authorId: ObjectId?): Boolean {
        val filter = if (authorId != null) {
            and(
                eq(ThemeGlossary::id.field(), ObjectId(id)),
                eq(ThemeGlossary::authorId.field(), authorId)
            )
        } else {
            eq(ThemeGlossary::id.field(), ObjectId(id))
        }
        val result = themeGlossaryCollection.deleteOne(filter)
        return result.deletedCount > 0
    }
}
