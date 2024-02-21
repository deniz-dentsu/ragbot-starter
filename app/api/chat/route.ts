import OpenAI from 'openai';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import { AstraDB } from "@datastax/astra-db-ts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const astraDb = new AstraDB(process.env.ASTRA_DB_APPLICATION_TOKEN, process.env.ASTRA_DB_ENDPOINT, process.env.ASTRA_DB_NAMESPACE);


async function main() {
  // Initialize the client
  const astraDb = new AstraDB(
    "AstraCS:RRnFuTXOwYthnKSmswSgiuji:ab51481d2e51ea2d84065d79e08c746b42f60295bab6b73aaaa82754569f7f55", "https://c174d10a-3ed2-4fba-be54-1681f923b9b7-us-east-1.apps.astra.datastax.com", "default_keyspace")
}
main().catch(console.error);


export async function POST(req: Request) {
  try {
    const { messages, useRag, llm, similarityMetric } = await req.json();

    const latestMessage = messages[messages?.length - 1]?.content;

    let docContext = '';
    if (useRag) {
      const { data } = await openai.embeddings.create({ input: latestMessage, model: 'text-embedding-ada-002' });
      console.log(data, 'data------------------------------------------')


      const collection = await astraDb.collection(`chat_${similarityMetric}`);
      // console.log(collection, 'collection------------------------------------------')


      const cursor = collection.find(null, {



        sort: {
          $vector: data[0]?.embedding,
        },
        limit: 10,
      });
      console.log(cursor, 'cursor------------------------------------------')

      const documents = await cursor.toArray();

      docContext = `
      START CONTEXT
      ${documents?.map(doc => `
        Date and Time: ${doc.date_and_time}, 
        Host: ${doc.host}, 
        Description: ${doc.description}, 
        Event Type: ${doc.event_type}, 
        URL: ${doc.url}, 
        RSVP: ${doc.rsvp}, 
        Location: ${doc.location}`).join("\n\n")}
      END CONTEXT`;

    }
    // console.log(docContext, 'documents------------------------------------------')

    const ragPrompt = [
      {
        role: 'system',
        content: `You are an assistant that helps Cannes visitors find events based on their schedule, location, and taste. 
    
        DOCUMENT:
          ${docContext}
    
        QUESTION:
          (users question)
    
          INSTRUCTIONS:
          Answer the users QUESTION using the DOCUMENT text above.
          Keep your answer grounded in the facts of the DOCUMENT. Always format responses using markdown.
          Provide clickable URL links for RSVPs where available. If a URL is mentioned in the DOCUMENT, ensure it is presented in a clickable format (e.g., [Register here](http://example.com)).
          Format each listing separately with space for better readability. Put a space before each paragraph.
          If the DOCUMENT doesn't contain the facts to answer the QUESTION, return {NONE}.
        `,
      },
    ];



    const response = await openai.chat.completions.create(
      {
        model: llm ?? 'gpt-3.5-turbo',
        stream: true,
        messages: [...ragPrompt, ...messages],
      }
    );
    const stream = OpenAIStream(response);
    return new StreamingTextResponse(stream);
  } catch (e) {
    throw e;
  }
}
