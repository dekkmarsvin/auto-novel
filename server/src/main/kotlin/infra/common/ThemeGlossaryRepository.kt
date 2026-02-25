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
        glossary: Map<String, String>,
    ): ThemeGlossary {
        val themeGlossary = ThemeGlossary(
            id = ObjectId(),
            name = name,
            authorId = authorId,
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

    suspend fun listAllByAuthor(authorId: ObjectId): List<ThemeGlossary> {
        return themeGlossaryCollection
            .find(eq(ThemeGlossary::authorId.field(), authorId))
            .toList()
    }

    suspend fun update(
        id: String,
        authorId: ObjectId, // Ensure only the author can update
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

        val result = themeGlossaryCollection.updateOne(
            and(
                eq(ThemeGlossary::id.field(), ObjectId(id)),
                eq(ThemeGlossary::authorId.field(), authorId)
            ),
            combine(updates)
        )
        return result.modifiedCount > 0
    }

    suspend fun delete(id: String, authorId: ObjectId): Boolean {
        val result = themeGlossaryCollection.deleteOne(
            and(
                eq(ThemeGlossary::id.field(), ObjectId(id)),
                eq(ThemeGlossary::authorId.field(), authorId)
            )
        )
        return result.deletedCount > 0
    }
}
