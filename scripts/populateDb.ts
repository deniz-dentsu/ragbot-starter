import { AstraDB } from "@datastax/astra-db-ts";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import 'dotenv/config'
import sampleData from './sample_data.json';
import OpenAI from 'openai';
import { SimilarityMetric } from "../app/hooks/useConfiguration";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const {ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_ENDPOINT, ASTRA_DB_NAMESPACE } = process.env;

const astraDb = new AstraDB(ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_ENDPOINT, ASTRA_DB_NAMESPACE);

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

const similarityMetrics: SimilarityMetric[] = [
  'cosine',
  'euclidean',
  'dot_product',
]

const createCollection = async (similarity_metric: SimilarityMetric = 'cosine') => {
  try {
    const res = await astraDb.createCollection(`chat_${similarity_metric}`, {
      vector: {
        dimension: 1536,
        metric: similarity_metric,
      }
    });
    console.log(res);
  } catch (e) {
    console.log(`chat_${similarity_metric} already exists`);
  }
};

const loadSampleData = async (similarity_metric: SimilarityMetric = 'cosine') => {
  const collection = await astraDb.collection(`chat_${similarity_metric}`);
  for await (const { date_and_time, host, description, event_type, url, rsvp, location} of sampleData) {
    const chunks = await splitter.splitText(description);
    let i = 0;
    for await (const chunk of chunks) {
      const {data} = await openai.embeddings.create({input: chunk, model: 'text-embedding-ada-002'});

      const res = await collection.insertOne({
        document_id: `${url}-${i}`,
        $vector: data[0]?.embedding,
        date_and_time,
        host,
        rsvp,
        url,
        event_type,
        location,
        description: chunk
      });
      i++;
    }
  }
  console.log('data loaded');
};

similarityMetrics.forEach(metric => {
  createCollection(metric).then(() => loadSampleData(metric));
  // createCollection(metric)
});
