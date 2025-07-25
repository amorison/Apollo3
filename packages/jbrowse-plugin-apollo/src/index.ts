/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { changeRegistry, checkRegistry } from '@apollo-annotation/common'
import {
  CDSCheck,
  CoreValidation,
  ParentChildValidation,
  changes,
  validationRegistry,
} from '@apollo-annotation/shared'
import Plugin from '@jbrowse/core/Plugin'
import type PluginManager from '@jbrowse/core/PluginManager'
import { ConfigurationSchema } from '@jbrowse/core/configuration'
import {
  DisplayType,
  InternetAccountType,
  type PluggableElementType,
  TrackType,
  type ViewType,
  WidgetType,
  createBaseTrackConfig,
  createBaseTrackModel,
} from '@jbrowse/core/pluggableElementTypes'
import {
  type AbstractSessionModel,
  type Region,
  getSession,
  isAbstractMenuManager,
} from '@jbrowse/core/util'
import { type LinearGenomeViewStateModel } from '@jbrowse/plugin-linear-genome-view'
import AddIcon from '@mui/icons-material/Add'

import { version } from '../package.json'

import {
  configSchema as apolloInternetAccountConfigSchema,
  modelFactory as apolloInternetAccountModelFactory,
} from './ApolloInternetAccount'
import { installApolloRefNameAliasAdapter } from './ApolloRefNameAliasAdapter'
import { installApolloSequenceAdapter } from './ApolloSequenceAdapter'
import { installApolloTextSearchAdapter } from './ApolloTextSearchAdapter'
import { type BackendDriver } from './BackendDrivers'
import {
  ApolloFeatureDetailsWidget,
  ApolloFeatureDetailsWidgetModel,
  ApolloTranscriptDetailsModel,
  ApolloTranscriptDetailsWidget,
} from './FeatureDetailsWidget'
import {
  configSchema as linearApolloDisplayConfigSchema,
  stateModelFactory as LinearApolloDisplayStateModelFactory,
} from './LinearApolloDisplay'
import {
  configSchema as linearApolloSixFrameDisplayConfigSchema,
  stateModelFactory as LinearApolloSixFrameDisplayStateModelFactory,
} from './LinearApolloSixFrameDisplay'
import {
  AddFeature,
  DownloadGFF3,
  LogOut,
  ManageChecks,
  OpenLocalFile,
  ViewChangeLog,
  ViewCheckResults,
} from './components'
import ApolloPluginConfigurationSchema from './config'
import {
  annotationFromJBrowseFeature,
  annotationFromPileup,
} from './extensions'
import {
  LinearApolloDisplayComponent,
  LinearApolloSixFrameDisplayComponent,
} from './makeDisplayComponent'
import { type ApolloSessionModel, extendSession } from './session'

interface RpcHandle {
  on(event: string, listener: (event: MessageEvent) => void): this
  workers: Worker[]
}

interface ApolloMessageData {
  apollo: true
  messageId: string
  method: string
  region: Region
  sequence: string
  assembly: string
}

function isApolloMessageData(data?: unknown): data is ApolloMessageData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'apollo' in data &&
    data.apollo === true
  )
}

const inWebWorker = 'WorkerGlobalScope' in globalThis

for (const [changeName, change] of Object.entries(changes)) {
  changeRegistry.registerChange(changeName, change)
}

const cdsCheck = new CDSCheck()
checkRegistry.registerCheck(cdsCheck.name, cdsCheck)
validationRegistry.registerValidation(new CoreValidation())
validationRegistry.registerValidation(new ParentChildValidation())

export default class ApolloPlugin extends Plugin {
  name = 'ApolloPlugin'
  version = version
  configurationSchema = ApolloPluginConfigurationSchema

  install(pluginManager: PluginManager) {
    installApolloSequenceAdapter(pluginManager)
    installApolloRefNameAliasAdapter(pluginManager)
    installApolloTextSearchAdapter(pluginManager)

    pluginManager.addWidgetType(() => {
      const configSchema = ConfigurationSchema('ApolloFeatureDetailsWidget', {})
      const widgetType = new WidgetType({
        name: 'ApolloFeatureDetailsWidget',
        heading: 'Apollo feature details',
        configSchema,
        stateModel: ApolloFeatureDetailsWidgetModel,
        ReactComponent: ApolloFeatureDetailsWidget,
      })
      return widgetType
    })
    pluginManager.addWidgetType(() => {
      const configSchema = ConfigurationSchema('ApolloTranscriptDetails', {})
      const widgetType = new WidgetType({
        name: 'ApolloTranscriptDetails',
        heading: 'Apollo transcript details',
        configSchema,
        stateModel: ApolloTranscriptDetailsModel,
        ReactComponent: ApolloTranscriptDetailsWidget,
      })
      return widgetType
    })
    pluginManager.addTrackType(() => {
      const configSchema = ConfigurationSchema(
        'ApolloTrack',
        { adapter: '' },
        {
          baseConfiguration: createBaseTrackConfig(pluginManager),
          explicitIdentifier: 'trackId',
        },
      )
      return new TrackType({
        name: 'ApolloTrack',
        configSchema,
        stateModel: createBaseTrackModel(
          pluginManager,
          'ApolloTrack',
          configSchema,
        ),
      })
    })

    pluginManager.addInternetAccountType(() => {
      return new InternetAccountType({
        name: 'ApolloInternetAccount',
        configSchema: apolloInternetAccountConfigSchema,
        stateModel: apolloInternetAccountModelFactory(
          apolloInternetAccountConfigSchema,
        ),
      })
    })

    pluginManager.addDisplayType(() => {
      const configSchema = linearApolloDisplayConfigSchema
      return new DisplayType({
        name: 'LinearApolloDisplay',
        configSchema,
        stateModel: LinearApolloDisplayStateModelFactory(
          pluginManager,
          configSchema,
        ),
        trackType: 'ApolloTrack',
        viewType: 'LinearGenomeView',
        ReactComponent: LinearApolloDisplayComponent,
      })
    })

    pluginManager.addDisplayType(() => {
      const configSchema = linearApolloSixFrameDisplayConfigSchema
      return new DisplayType({
        name: 'LinearApolloSixFrameDisplay',
        configSchema,
        stateModel: LinearApolloSixFrameDisplayStateModelFactory(
          pluginManager,
          configSchema,
        ),
        trackType: 'ApolloTrack',
        viewType: 'LinearGenomeView',
        ReactComponent: LinearApolloSixFrameDisplayComponent,
      })
    })

    pluginManager.addToExtensionPoint(
      'Core-extendSession',
      // @ts-expect-error not sure how to deal with snapshot model types
      extendSession.bind(this, pluginManager),
    )

    pluginManager.addToExtensionPoint(
      'Core-extendPluggableElement',
      (pluggableElement: PluggableElementType) => {
        if (pluggableElement.name === 'LinearGenomeView') {
          const { stateModel } = pluggableElement as ViewType
          const lgv = stateModel as LinearGenomeViewStateModel
          const newStateModel = lgv.views((self) => {
            const superRubberBandMenuItems = self.rubberBandMenuItems
            return {
              rubberBandMenuItems() {
                return [
                  ...superRubberBandMenuItems(),
                  {
                    label: 'Add new feature',
                    icon: AddIcon,
                    onClick: () => {
                      const session = getSession(
                        self,
                      ) as unknown as ApolloSessionModel
                      const { leftOffset, rightOffset } = self
                      const selectedRegions = self.getSelectedRegions(
                        leftOffset,
                        rightOffset,
                      )
                      ;(session as unknown as AbstractSessionModel).queueDialog(
                        (doneCallback) => [
                          AddFeature,
                          {
                            session,
                            handleClose: () => {
                              doneCallback()
                            },
                            region: selectedRegions[0],
                            changeManager:
                              session.apolloDataStore.changeManager,
                          },
                        ],
                      )
                    },
                  },
                ]
              },
            }
          })
          ;(pluggableElement as ViewType).stateModel = newStateModel
        }
        return pluggableElement
      },
    )

    pluginManager.addToExtensionPoint(
      'Core-extendPluggableElement',
      annotationFromPileup,
    )
    pluginManager.addToExtensionPoint(
      'Core-extendPluggableElement',
      annotationFromJBrowseFeature,
    )
    if (!inWebWorker) {
      pluginManager.addToExtensionPoint(
        'Core-extendWorker',
        (handle: RpcHandle) => {
          if (!('on' in handle && handle.on)) {
            return handle
          }
          handle.on('apollo', async (event: MessageEvent) => {
            if (!isApolloMessageData(event)) {
              return
            }
            const { apollo, messageId, method } = event
            switch (method) {
              case 'getSequence': {
                const { region } = event
                const { assemblyName } = region
                const dataStore = (
                  pluginManager.rootModel?.session as
                    | ApolloSessionModel
                    | undefined
                )?.apolloDataStore
                if (!dataStore) {
                  break
                }
                const backendDriver = dataStore.getBackendDriver(
                  assemblyName,
                ) as BackendDriver
                const { seq: sequence } =
                  await backendDriver.getSequence(region)
                handle.workers[0].postMessage({
                  apollo,
                  messageId,
                  sequence,
                })
                break
              }
              case 'getRegions': {
                const { assembly } = event
                const dataStore = (
                  pluginManager.rootModel?.session as
                    | ApolloSessionModel
                    | undefined
                )?.apolloDataStore
                if (!dataStore) {
                  break
                }
                const backendDriver = dataStore.getBackendDriver(
                  assembly,
                ) as BackendDriver
                const regions = await backendDriver.getRegions(assembly)
                handle.workers[0].postMessage({
                  apollo,
                  messageId,
                  regions,
                })
                break
              }
              case 'getRefNameAliases': {
                const { assembly } = event
                const dataStore = (
                  pluginManager.rootModel?.session as
                    | ApolloSessionModel
                    | undefined
                )?.apolloDataStore
                if (!dataStore) {
                  break
                }
                const backendDriver = dataStore.getBackendDriver(
                  assembly,
                ) as BackendDriver
                const refNameAliases =
                  await backendDriver.getRefNameAliases(assembly)
                handle.workers[0].postMessage({
                  apollo,
                  messageId,
                  refNameAliases,
                })
                break
              }
              default: {
                break
              }
            }
          })
          return handle
        },
      )
    }
  }

  configure(pluginManager: PluginManager) {
    if (isAbstractMenuManager(pluginManager.rootModel)) {
      pluginManager.rootModel.appendToMenu('Apollo', {
        label: 'Download GFF3',
        onClick: (session: ApolloSessionModel) => {
          ;(session as unknown as AbstractSessionModel).queueDialog(
            (doneCallback) => [
              DownloadGFF3,
              {
                session,
                handleClose: () => {
                  doneCallback()
                },
              },
            ],
          )
        },
      })
      pluginManager.rootModel.appendToMenu('Apollo', {
        label: 'Manage Checks',
        onClick: (session: ApolloSessionModel) => {
          ;(session as unknown as AbstractSessionModel).queueDialog(
            (doneCallback) => [
              ManageChecks,
              {
                session,
                handleClose: () => {
                  doneCallback()
                },
              },
            ],
          )
        },
      })
      pluginManager.rootModel.appendToMenu('Apollo', {
        label: 'View Change Log',
        onClick: (session: ApolloSessionModel) => {
          ;(session as unknown as AbstractSessionModel).queueDialog(
            (doneCallback) => [
              ViewChangeLog,
              {
                session,
                handleClose: () => {
                  doneCallback()
                },
              },
            ],
          )
        },
      })
      pluginManager.rootModel.appendToMenu('Apollo', {
        label: 'Open local GFF3 file',
        onClick: (session: ApolloSessionModel) => {
          ;(session as unknown as AbstractSessionModel).queueDialog(
            (doneCallback) => [
              OpenLocalFile,
              {
                session,
                handleClose: () => {
                  doneCallback()
                },
                inMemoryFileDriver: session.apolloDataStore.inMemoryFileDriver,
              },
            ],
          )
        },
      })
      pluginManager.rootModel.appendToMenu('Apollo', {
        label: 'View check results',
        onClick: (session: ApolloSessionModel) => {
          ;(session as unknown as AbstractSessionModel).queueDialog(
            (doneCallback) => [
              ViewCheckResults,
              {
                session,
                handleClose: () => {
                  doneCallback()
                },
              },
            ],
          )
        },
      })
      pluginManager.rootModel.appendToMenu('Apollo', {
        label: 'Log out',
        onClick: (session: ApolloSessionModel) => {
          ;(session as unknown as AbstractSessionModel).queueDialog(
            (doneCallback) => [
              LogOut,
              {
                session,
                handleClose: () => {
                  doneCallback()
                },
              },
            ],
          )
        },
      })
    }
  }
}
