import {
  JBrowseConfig,
  JBrowseConfigDocument,
} from '@apollo-annotation/schemas'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import merge from 'deepmerge'
import { Model, Types } from 'mongoose'

import { AssembliesService } from '../assemblies/assemblies.service'
import { RefSeqsService } from '../refSeqs/refSeqs.service'
import { Role } from '../utils/role/role.enum'

@Injectable()
export class JBrowseService {
  constructor(
    private readonly assembliesService: AssembliesService,
    private readonly refSeqsService: RefSeqsService,
    @InjectModel(JBrowseConfig.name)
    private readonly jbrowseConfigModel: Model<JBrowseConfigDocument>,
    private readonly configService: ConfigService<
      {
        URL: string
        NAME: string
        DESCRIPTION?: string
        PLUGIN_LOCATION?: string
        FEATURE_TYPE_ONTOLOGY_LOCATION?: string
      },
      true
    >,
  ) {}

  private readonly logger = new Logger(JBrowseService.name)

  get internetAccountId() {
    const name = this.configService.get('NAME', { infer: true })
    return `${name}-apolloInternetAccount`
  }

  getConfiguration(role: Role) {
    const feature_type_ontology_location =
      this.configService.get('FEATURE_TYPE_ONTOLOGY_LOCATION', {
        infer: true,
      }) ?? 'sequence_ontology.json'
    const configuration = {
      theme: {
        palette: {
          primary: {
            main: '#0c4f4b',
          },
          secondary: {
            main: '#1AA39B',
          },
          tertiary: {
            main: '#4f0c10',
          },
          quaternary: {
            main: '#571AA3',
          },
          framesCDS: [
            null,
            { main: 'rgb(204,121,167)' },
            { main: 'rgb(230,159,0)' },
            { main: 'rgb(240,228,66)' },
            { main: 'rgb(86,180,233)' },
            { main: 'rgb(0,114,178)' },
            { main: 'rgb(0,158,115)' },
          ],
        },
      },
      ApolloPlugin: { hasRole: false },
    }
    if (role === Role.None) {
      return configuration
    }
    return {
      ...configuration,
      ApolloPlugin: {
        hasRole: true,
        ontologies: [
          {
            name: 'Sequence Ontology',
            source: {
              uri: feature_type_ontology_location,
              locationType: 'UriLocation',
            },
          },
        ],
      },
    }
  }

  getPlugins() {
    const pluginLocation =
      this.configService.get('PLUGIN_LOCATION', { infer: true }) ?? 'apollo.js'
    return [
      {
        name: 'Apollo',
        url: pluginLocation,
      },
    ]
  }

  getInternetAccounts() {
    const url = this.configService.get('URL', { infer: true })
    const name = this.configService.get('NAME', { infer: true })
    const description =
      this.configService.get('DESCRIPTION', { infer: true }) ?? ''
    const urlObj = new URL(url)
    return [
      {
        type: 'ApolloInternetAccount',
        internetAccountId: this.internetAccountId,
        name,
        description,
        domains: [urlObj.host],
        baseURL: url,
      },
    ]
  }

  getDefaultSession() {
    return {
      name: 'Apollo',
      views: [{ type: 'LinearGenomeView' }],
    }
  }

  async getAssemblies() {
    const url = this.configService.get('URL', { infer: true })
    const assemblies = await this.assembliesService.findAll()
    return Promise.all(
      assemblies.map(async (assembly) => {
        const assemblyId = assembly._id.toHexString()
        const refSeqs = await this.refSeqsService.findAll({
          assembly: assemblyId,
        })
        const ids: Record<string, string> = {}
        refSeqs.map((refSeq) => {
          ids[refSeq.name] = (refSeq._id as Types.ObjectId).toHexString()
        })
        this.logger.debug(`generating assembly ${assemblyId}`)
        return {
          name: assemblyId,
          aliases:
            assembly.aliases.length > 0
              ? [...assembly.aliases]
              : [assembly.name],
          displayName: assembly.displayName || assembly.name,
          sequence: {
            trackId: `sequenceConfigId-${assembly.name}`,
            type: 'ReferenceSequenceTrack',
            adapter: {
              type: 'ApolloSequenceAdapter',
              assemblyId,
              baseURL: {
                uri: url,
                locationType: 'UriLocation',
              },
            },
            metadata: {
              apollo: true,
              internetAccountConfigId: this.internetAccountId,
              ids,
            },
          },
          refNameAliases: {
            adapter: {
              type: 'ApolloRefNameAliasAdapter',
              assemblyId,
              baseURL: { uri: url, locationType: 'UriLocation' },
            },
          },
        }
      }),
    )
  }

  async getTracks() {
    const url = this.configService.get('URL', { infer: true })
    const assemblies = await this.assembliesService.findAll()
    return assemblies.map((assembly) => {
      const trackId = `apollo_track_${assembly.id}`
      return {
        type: 'ApolloTrack',
        trackId,
        name: `Annotations (${assembly.displayName || assembly.name})`,
        assemblyNames: [assembly.id],
        textSearching: {
          textSearchAdapter: {
            type: 'ApolloTextSearchAdapter',
            trackId,
            assemblyNames: [assembly.id],
            textSearchAdapterId: `apollo_search_${assembly.id}`,
            baseURL: {
              uri: url,
              locationType: 'UriLocation',
            },
          },
        },
      }
    })
  }

  async getJBrowseConfig() {
    const document = await this.jbrowseConfigModel.findOne().exec()
    return document?.toJSON()
  }

  async getConfig(role: Role) {
    if (role === Role.None) {
      return {
        configuration: this.getConfiguration(role),
        plugins: this.getPlugins(),
        internetAccounts: this.getInternetAccounts(),
      }
    }
    const storedConfig = await this.getJBrowseConfig()
    const generatedConfig = {
      configuration: this.getConfiguration(role),
      assemblies: await this.getAssemblies(),
      tracks: await this.getTracks(),
      plugins: this.getPlugins(),
      internetAccounts: this.getInternetAccounts(),
      defaultSession: this.getDefaultSession(),
    }
    if (!storedConfig) {
      return generatedConfig
    }
    return merge(generatedConfig, storedConfig)
  }
}
