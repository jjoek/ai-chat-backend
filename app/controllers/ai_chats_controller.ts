
import fs from 'fs';
import { Ollama } from 'ollama';
import { supportedModels } from '#config/jjoek'; // TODO: rely on the service container to pull the config, to avoid loading it on class initialization
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import logger from '@adonisjs/core/services/logger';
import config from '@adonisjs/core/services/config';
import type { HttpContext } from '@adonisjs/core/http';

let chatHistory = [];

type ChatResponse = {
  role: string;
  content: string;
};


export default class AiChatsController {
  public async chat({ response, request }: HttpContext) {
    const { userMessage, modelId, file } = this.validateData(request);

    const startedAt = Date.now();

    logger.info(`Started processing request at ${this.formatTimestamp(startedAt)}`);
    const res = await this.sendToModelForProcessing(modelId, userMessage, file);

    return response.json({
      message: 'User query response',
      success: true,
      modelRes: res,
      chatHistory,
      times: {
        startTime: this.formatTimestamp(startedAt),
        endTime: this.formatTimestamp(Date.now()),
        diffInSeconds: `${(Date.now() - startedAt) / 1000} seconds`
      }
    })
  }

  public clearChatHistory({ response }: HttpContext)
  {
    chatHistory = [];

    return response.json({
      success: true,
      message: 'Chat history cleared successfully'
    })
  }

  public async supportedModels({ response }: HttpContext) {
    const models = config.get('jjoek.supportedModels');

    return response.json({
      success: true,
      message: 'List of supported models',
      models,
      selectedModel: models.find((m) => m.id === 'deepseek-r1:1.5b') || models[0],
    })
  }

  public chatHistory({response} : HttpContext) {
    return response.json({
      success: true,
      message: 'Chat History',
      chats: chatHistory
    })
  }

  private validateData(request: any)
  {
    const requestData = request.body();
    const userMessage = requestData.message;
    const modelId = requestData.modelId; // validate that this a supported model and probably the user has access to it
    let file = request.file('file', {
      size: '10mb',
      extnames: ['pdf']
    });

    if(!userMessage.trim()) throw new Error('Invalid text prompt');

    if(!supportedModels.find((model) =>  model.id === modelId)) throw new Error(`${modelId} model is not supported`);

    if(request.file('file') && !file.isValid) throw new Error("Invalid file, should be max 10mb size and only PDF formats are accepted")

    return {userMessage, modelId, file};
  }

  private async sendToModelForProcessing(modelId: string, userMessage: string, file: any) //: Promise<ChatResponse>
  {
    let messages = [
      {role: 'system', content: "My name is JJoek AI, an an artificial intelligence assistant created by JJoek."},
      ...chatHistory, // include chat history
    ]

    if(file) {
      let probableDocReferences = await this.extractProbableDocumentReferences(userMessage, file)

      if(probableDocReferences.length > 0) {
        messages.push({
          role: "system",
          content: `You are a helpful assistant answering the user questions based on the given document.
            Use ONLY the following information from the document to answer the user's question.
            If you can't find relevant information in the provided context, say so clearly.
            --- DOCUMENT EXCERPTS ---
            ${probableDocReferences.join('')}
            --- END OF EXCERPTS ---`
        })
      }
    }
    messages.push({ role: 'user', content: userMessage });

    const res = await (new Ollama({
        // host: 'ollama:11434'
        host: 'http://host.docker.internal:11434'
      })).chat({
        model: modelId,
        messages,
      })

    logger.info("Data fetched successfully");
    logger.info(JSON.stringify(res, null, 2));

    const parsedRes = this.parseResponse(modelId, res);
    this.updateHistory(modelId, userMessage, parsedRes)

    return parsedRes;
  }

  private async extractProbableDocumentReferences(userMessage, file): Promise<string[]>
  {
    const queryTerms = userMessage.toLowerCase().split(/\s+/)
      .filter(term => term.length > 3)
      .map(term => term.replace(/[.,?!;:()"']/g, ""));

    if(queryTerms.length <= 0) return [];

    const pdfText = await this.parsePDFToText(file);

    const pdfChunks = this.splitPDFIntoChunks(pdfText);

    return this.fetchRelevantChunks(queryTerms, pdfChunks);
  }

  private fetchRelevantChunks(queryTerms, pdfChunks)
  {
    const scoredChunks = pdfChunks.map(chunk => {
      const chunkLower = chunk.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        const regex = new RegExp(term, 'gi');
        const matches = chunkLower.match(regex);
        if (matches) score += matches.length;
      }
      return { chunk, score };
    });

    return scoredChunks
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.chunk);
  }

  private splitPDFIntoChunks(pdfText: string, chunkSize?: number): string[]
  {
    const chunkMaxSize = chunkSize ? chunkSize : 500;

    let pdfChunks: string[] = []
    let currentChunk = ""
    for(let word of pdfText.split(/\s+/)) {
      if((`${currentChunk} ${word}`).length <= chunkMaxSize) {
        currentChunk = `${currentChunk} ${word}`;
      } else {
        pdfChunks.push(currentChunk);
        currentChunk = "";
      }
    }

    return pdfChunks;
  }

  private async parsePDFToText(uploadedPDFFile)
  {
    const dataBuffer = fs.readFileSync(uploadedPDFFile.tmpPath)
    const data = await pdfParse(dataBuffer)

    return data.text;
  }


  /**
   * TODO: fix the chat history ids below
   * @param userMessage
   * @param parsedRes
   */
  private updateHistory(modelId, userMessage: string, parsedRes: ChatResponse)
  {
    const model = supportedModels.find((m) => m.id ===  modelId);

    chatHistory.push({
      id: Date.now(),
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      modelId,
      modelName: model?.name
    });

    chatHistory.push({
      ...parsedRes,
      id: Date.now()+1,
      timestamp: new Date(),
      modelId,
      modelName: model?.name
    });
  }

  private parseResponse(modelId: string, res: any) : ChatResponse
  {
    return {
      role: res.message.role,
      content: res.message.content.replace(/<think>.*?<\/think>\n\n/gs, '')
    }
  }

  private formatTimestamp(timestamp) {
    const date = new Date(timestamp);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

