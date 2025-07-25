/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { type ApolloAssembly } from '@apollo-annotation/mst'
import { annotationFeatureToGFF3 } from '@apollo-annotation/shared'
import gff, { type GFF3Item } from '@gmod/gff'
import { type Assembly } from '@jbrowse/core/assemblyManager/assembly'
import { getConf } from '@jbrowse/core/configuration'
import {
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogContentText,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Select,
  type SelectChangeEvent,
} from '@mui/material'
import { saveAs } from 'file-saver'
import { type IMSTMap, getSnapshot } from 'mobx-state-tree'
import React, { useState } from 'react'

import {
  type ApolloInternetAccount,
  type CollaborationServerDriver,
  type InMemoryFileDriver,
} from '../BackendDrivers'
import { type ApolloSessionModel } from '../session'
import { createFetchErrorMessage } from '../util'

import { Dialog } from './Dialog'

interface DownloadGFF3Props {
  session: ApolloSessionModel
  handleClose(): void
}

export function DownloadGFF3({ handleClose, session }: DownloadGFF3Props) {
  const [includeFASTA, setincludeFASTA] = useState(false)
  const [selectedAssembly, setSelectedAssembly] = useState<Assembly>()
  const [errorMessage, setErrorMessage] = useState('')

  const { collaborationServerDriver, getInternetAccount, inMemoryFileDriver } =
    session.apolloDataStore as {
      collaborationServerDriver: CollaborationServerDriver
      inMemoryFileDriver: InMemoryFileDriver
      getInternetAccount(
        assemblyName?: string,
        internetAccountId?: string,
      ): ApolloInternetAccount
    }
  const assemblies = [
    ...collaborationServerDriver.getAssemblies(),
    ...inMemoryFileDriver.getAssemblies(),
  ]

  function handleChangeAssembly(e: SelectChangeEvent) {
    const newAssembly = assemblies.find((asm) => asm.name === e.target.value)
    setSelectedAssembly(newAssembly)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    if (!selectedAssembly) {
      setErrorMessage('Must select assembly to download')
      return
    }

    const { internetAccountConfigId } = getConf(selectedAssembly, [
      'sequence',
      'metadata',
    ]) as { internetAccountConfigId?: string }
    if (internetAccountConfigId) {
      await exportFromCollaborationServer(internetAccountConfigId)
    } else {
      exportFromMemory(session)
    }
    handleClose()
  }

  async function exportFromCollaborationServer(
    internetAccountConfigId: string,
  ) {
    if (!selectedAssembly) {
      setErrorMessage('Must select assembly to download')
      return
    }
    const internetAccount = getInternetAccount(
      selectedAssembly.configuration.name,
      internetAccountConfigId,
    )
    const url = new URL('export/getID', internetAccount.baseURL)
    const searchParams = new URLSearchParams({
      assembly: selectedAssembly.name,
    })
    url.search = searchParams.toString()
    const uri = url.toString()
    const apolloFetch = internetAccount.getFetcher({
      locationType: 'UriLocation',
      uri,
    })
    const response = await apolloFetch(uri, { method: 'GET' })
    if (!response.ok) {
      const newErrorMessage = await createFetchErrorMessage(
        response,
        'Error when exporting ID',
      )
      setErrorMessage(newErrorMessage)
      return
    }
    const { exportID } = (await response.json()) as { exportID: string }

    const exportURL = new URL('export', internetAccount.baseURL)
    const params: Record<string, string> = {
      exportID,
      includeFASTA: includeFASTA ? 'true' : 'false',
    }
    const exportSearchParams = new URLSearchParams(params)
    exportURL.search = exportSearchParams.toString()
    const exportUri = exportURL.toString()

    window.open(exportUri, '_blank')
  }

  function exportFromMemory(session: ApolloSessionModel) {
    if (!selectedAssembly) {
      setErrorMessage('Must select assembly to download')
      return
    }
    const { assemblies } = session.apolloDataStore as {
      assemblies: IMSTMap<typeof ApolloAssembly>
    }
    const assembly = assemblies.get(selectedAssembly.name)
    const refSeqs = assembly?.refSeqs
    if (!refSeqs) {
      setErrorMessage(
        `No refSeqs found for assembly "${selectedAssembly.name}"`,
      )
      return
    }
    const gff3Items: GFF3Item[] = [{ directive: 'gff-version', value: '3' }]
    const sequenceFeatures = getConf(selectedAssembly, [
      'sequence',
      'adapter',
      'features',
    ]) as { refName: string; start: number; end: number; seq: string }[]
    for (const sequenceFeature of sequenceFeatures) {
      const { end, refName, start } = sequenceFeature
      gff3Items.push({
        directive: 'sequence-region',
        value: `${refName} ${start + 1} ${end}`,
      })
    }
    for (const [, refSeq] of refSeqs) {
      const { features } = refSeq
      if (!features) {
        continue
      }
      for (const [, feature] of features) {
        gff3Items.push(annotationFeatureToGFF3(getSnapshot(feature)))
      }
    }
    for (const sequenceFeature of sequenceFeatures) {
      const { refName, seq } = sequenceFeature
      gff3Items.push({ id: refName, description: '', sequence: seq })
    }
    const gff3 = gff.formatSync(gff3Items)
    const gff3Blob = new Blob([gff3], { type: 'text/plain;charset=utf-8' })
    saveAs(
      gff3Blob,
      `${selectedAssembly.displayName ?? selectedAssembly.name}.gff3`,
    )
  }

  return (
    <Dialog
      open
      title="Export GFF3"
      handleClose={handleClose}
      maxWidth={false}
      data-testid="download-gff3"
    >
      <form onSubmit={onSubmit}>
        <DialogContent style={{ display: 'flex', flexDirection: 'column' }}>
          <DialogContentText>Select assembly</DialogContentText>
          <Select
            labelId="label"
            value={selectedAssembly?.name ?? ''}
            onChange={handleChangeAssembly}
            disabled={assemblies.length === 0}
          >
            {assemblies.map((option) => (
              <MenuItem key={option.name} value={option.name}>
                {option.displayName ?? option.name}
              </MenuItem>
            ))}
          </Select>
          <DialogContentText>
            Select assembly to export to GFF3
          </DialogContentText>

          <FormGroup>
            <FormControlLabel
              data-testid="include-fasta-checkbox"
              control={
                <Checkbox
                  checked={includeFASTA}
                  onChange={() => {
                    setincludeFASTA(!includeFASTA)
                  }}
                />
              }
              label="Include fasta sequence in GFF output"
            />
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={!selectedAssembly}
            variant="contained"
            type="submit"
          >
            Download
          </Button>
          <Button variant="outlined" type="submit" onClick={handleClose}>
            Cancel
          </Button>
        </DialogActions>
      </form>
      {errorMessage ? (
        <DialogContent>
          <DialogContentText color="error">{errorMessage}</DialogContentText>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
