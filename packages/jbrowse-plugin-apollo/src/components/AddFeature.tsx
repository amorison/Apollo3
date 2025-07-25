/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { type AnnotationFeatureSnapshot } from '@apollo-annotation/mst'
import { AddFeatureChange } from '@apollo-annotation/shared'
import { type Region } from '@jbrowse/core/util/types'
import InfoIcon from '@mui/icons-material/Info'
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  type SelectChangeEvent,
  TextField,
  Tooltip,
} from '@mui/material'
import ObjectID from 'bson-objectid'
import React, { useState } from 'react'

import { type ChangeManager } from '../ChangeManager'
import { isOntologyClass } from '../OntologyManager'
import { type ApolloSessionModel } from '../session'

import { Dialog } from './Dialog'
import { OntologyTermAutocomplete } from './OntologyTermAutocomplete'

interface AddFeatureProps {
  session: ApolloSessionModel
  handleClose(): void
  region: Region
  changeManager: ChangeManager
}

enum NewFeature {
  GENE_AND_SUBFEATURES = 'GENE_AND_SUBFEATURES',
  TRANSCRIPT_AND_SUBFEATURES = 'TRANSCRIPT_AND_SUBFEATURES',
  CUSTOM = 'CUSTOM',
}

function makeCodingMrna(
  refSeqId: string,
  strand: 1 | -1 | undefined,
  min: number,
  max: number,
): AnnotationFeatureSnapshot {
  const cds = {
    _id: new ObjectID().toHexString(),
    refSeq: refSeqId,
    type: 'CDS',
    min,
    max,
    strand,
  } as AnnotationFeatureSnapshot

  const exon = {
    _id: new ObjectID().toHexString(),
    refSeq: refSeqId,
    type: 'exon',
    min,
    max,
    strand,
  } as AnnotationFeatureSnapshot

  const children: Record<string, AnnotationFeatureSnapshot> = {}
  children[cds._id] = cds
  children[exon._id] = exon

  const mRNA = {
    _id: new ObjectID().toHexString(),
    refSeq: refSeqId,
    type: 'mRNA',
    min,
    max,
    strand,
    children,
  } as AnnotationFeatureSnapshot

  return mRNA
}

export function AddFeature({
  changeManager,
  handleClose,
  region,
  session,
}: AddFeatureProps) {
  const [end, setEnd] = useState(String(region.end))
  const [start, setStart] = useState(String(region.start + 1))
  const [type, setType] = useState<NewFeature>(NewFeature.GENE_AND_SUBFEATURES)
  const [customType, setCustomType] = useState<string>()
  const [strand, setStrand] = useState<1 | -1 | undefined>()
  const [errorMessage, setErrorMessage] = useState('')

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')

    let refSeqId
    for (const [, asm] of session.apolloDataStore.assemblies ?? new Map()) {
      if (asm._id === region.assemblyName) {
        for (const [, refseq] of asm.refSeqs ?? new Map()) {
          if (refseq.name === region.refName) {
            refSeqId = refseq._id
          }
        }
      }
    }

    if (!refSeqId) {
      setErrorMessage(
        'Invalid refseq id. Make sure you have the Apollo annotation track open',
      )
      return
    }

    if (type === NewFeature.GENE_AND_SUBFEATURES) {
      const mRNA = makeCodingMrna(
        refSeqId,
        strand,
        Number(start) - 1,
        Number(end),
      )
      const children: Record<string, AnnotationFeatureSnapshot> = {}
      children[mRNA._id] = mRNA

      const id = new ObjectID().toHexString()
      const change = new AddFeatureChange({
        changedIds: [id],
        typeName: 'AddFeatureChange',
        assembly: region.assemblyName,
        addedFeature: {
          _id: id,
          refSeq: refSeqId,
          min: Number(start) - 1,
          max: Number(end),
          type: 'gene',
          strand,
          children,
        },
      })
      void changeManager.submit(change)
      handleClose()
      return
    }
    if (type === NewFeature.TRANSCRIPT_AND_SUBFEATURES) {
      const mRNA = makeCodingMrna(
        refSeqId,
        strand,
        Number(start) - 1,
        Number(end),
      )
      const change = new AddFeatureChange({
        changedIds: [mRNA._id],
        typeName: 'AddFeatureChange',
        assembly: region.assemblyName,
        addedFeature: mRNA,
      })
      void changeManager.submit(change)
      handleClose()
      return
    }

    if (!customType) {
      setErrorMessage('No type selected')
      return
    }
    const id = new ObjectID().toHexString()
    const change = new AddFeatureChange({
      changedIds: [id],
      typeName: 'AddFeatureChange',
      assembly: region.assemblyName,
      addedFeature: {
        _id: id,
        refSeq: refSeqId,
        min: Number(start) - 1,
        max: Number(end),
        type: customType,
        strand,
      },
    })
    void changeManager.submit(change)
    handleClose()
    return
  }

  function handleChangeStrand(e: SelectChangeEvent) {
    setErrorMessage('')

    switch (Number(e.target.value)) {
      case 1: {
        setStrand(1)
        break
      }
      case -1: {
        setStrand(-1)
        break
      }
      default: {
        setStrand(undefined)
      }
    }
  }

  const error = Number(end) <= Number(start)

  function handleChangeOntologyType(newType: string) {
    setErrorMessage('')
    setCustomType(newType)
  }

  const handleTypeChange = (e: SelectChangeEvent) => {
    setErrorMessage('')
    const { value } = e.target
    if (Object.keys(NewFeature).includes(value)) {
      setType(NewFeature[value as NewFeature])
    }
  }

  let submitDisabled: boolean = Boolean(error) || !(start && end && type)
  if (
    (type === NewFeature.CUSTOM && !customType) ||
    (!strand && type === NewFeature.GENE_AND_SUBFEATURES) ||
    (!strand && type === NewFeature.TRANSCRIPT_AND_SUBFEATURES)
  ) {
    submitDisabled = true
  }

  return (
    <Dialog
      open
      title="Add new feature"
      handleClose={handleClose}
      maxWidth={false}
      data-testid="add-feature-dialog"
    >
      <form onSubmit={onSubmit} data-testid="submit-form">
        <DialogContent style={{ display: 'flex', flexDirection: 'column' }}>
          <TextField
            margin="dense"
            id="start"
            label="Start"
            type="number"
            fullWidth
            variant="outlined"
            value={Number(start)}
            onChange={(e) => {
              setStart(e.target.value)
            }}
          />
          <TextField
            margin="dense"
            id="end"
            label="End"
            type="number"
            fullWidth
            variant="outlined"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value)
            }}
            error={error}
            helperText={error ? '"End" must be greater than "Start"' : null}
          />
          <FormControl>
            <InputLabel id="demo-simple-select-label">Strand</InputLabel>
            <Select
              labelId="demo-simple-select-label"
              id="demo-simple-select"
              label="Strand"
              value={strand?.toString()}
              onChange={handleChangeStrand}
            >
              <MenuItem value={undefined}></MenuItem>
              <MenuItem value={1}>+</MenuItem>
              <MenuItem value={-1}>-</MenuItem>
            </Select>
          </FormControl>

          <FormControl style={{ marginTop: 20 }}>
            <RadioGroup
              aria-labelledby="demo-radio-buttons-group-label"
              defaultValue={NewFeature.GENE_AND_SUBFEATURES}
              name="radio-buttons-group"
              value={type}
              onChange={handleTypeChange}
            >
              <FormControlLabel
                value={NewFeature.GENE_AND_SUBFEATURES}
                control={<Radio />}
                label={
                  <Box display="flex" alignItems="center">
                    Add gene and sub-features
                    <Tooltip title="This is a shortcut to create a gene with a single mRNA, exon, and CDS">
                      <IconButton size="small">
                        <InfoIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                }
              />

              <FormControlLabel
                value={NewFeature.TRANSCRIPT_AND_SUBFEATURES}
                control={<Radio />}
                label={
                  <Box display="flex" alignItems="center">
                    Add transcript and sub-features
                    <Tooltip title="This is a shortcut to create a single mRNA with exon and CDS, but without a parent gene">
                      <IconButton size="small">
                        <InfoIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                }
              />
              <FormControlLabel
                value={NewFeature.CUSTOM}
                checked={
                  type !== NewFeature.GENE_AND_SUBFEATURES &&
                  type !== NewFeature.TRANSCRIPT_AND_SUBFEATURES
                }
                control={<Radio />}
                label="Add feature with a sequence ontology type"
              />
            </RadioGroup>
          </FormControl>
          {type === NewFeature.CUSTOM ? (
            <OntologyTermAutocomplete
              session={session}
              ontologyName="Sequence Ontology"
              style={{ width: 170 }}
              value=""
              filterTerms={isOntologyClass}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Type"
                  variant="outlined"
                  fullWidth
                />
              )}
              onChange={(_oldValue, newValue) => {
                if (newValue) {
                  handleChangeOntologyType(newValue)
                }
              }}
            />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" type="submit" disabled={submitDisabled}>
            Submit
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
