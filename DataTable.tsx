import { Button } from '@mui/material'
import { ReactGrid, Column, Row, CellChange, TextCell } from '@silevis/reactgrid'
import '@silevis/reactgrid/styles.css'
import { GridColDef } from '@/components/mui'
import { useState, useEffect, useMemo } from 'react'
import { ReshapedChartData } from './types'

interface DataTableProps {
  tableData: { columns: GridColDef[]; rows: any[] }
  isTransposed: boolean
  onToggleTranspose: () => void
  onDataChange: (newData: ReshapedChartData) => void
  originalData: ReshapedChartData | null
}

const reorderArray = <T,>(array: T[], fromIndexes: number[], toIndex: number): T[] => {
  const result = [...array]
  const itemsToMove = fromIndexes.map((i) => array[i])

  fromIndexes
    .sort((a, b) => b - a)
    .forEach((index) => {
      result.splice(index, 1)
    })

  result.splice(toIndex, 0, ...itemsToMove)
  return result
}

const convertDataForReactGrid = (tableData: DataTableProps['tableData']) => {
  if (!tableData || !tableData.columns || tableData.columns.length === 0 || !tableData.rows) {
    return { reactGridColumns: [], reactGridRows: [] }
  }
  const reactGridColumns: Column[] = tableData.columns.map((col) => ({
    columnId: col.field,
    reorderable: true,
    width: col.autoSize ? 'auto' : 150,
    resizable: true
  }))
  const headerRow: Row = {
    rowId: 'header',
    cells: tableData.columns.map((col) => ({ type: 'header', text: col.headerName || col.field }))
  }

  const dataRows: Row[] = tableData.rows.map((row, idx) => ({
    rowId: String(row.id ?? `row-${idx}`),
    reorderable: true,
    cells: tableData.columns.map((col) => ({
      type: 'text',
      text: row[col.field]?.toString() || ''
    }))
  }))

  const reactGridRows: Row[] = [headerRow, ...dataRows]
  return { reactGridColumns, reactGridRows }
}

const isMacOs = () => {
  return navigator.platform.toLowerCase().includes('mac')
}

const DataTable = ({
  tableData,
  isTransposed,
  onToggleTranspose,
  onDataChange,
  originalData
}: DataTableProps) => {
  const { reactGridColumns: initialColumns, reactGridRows } = useMemo(
    () => convertDataForReactGrid(tableData),
    [tableData]
  )

  const [gridColumns, setGridColumns] = useState<Column[]>(initialColumns)
  const [gridRows, setGridRows] = useState<Row[]>(reactGridRows)
  const [cellChangesIndex, setCellChangesIndex] = useState(-1)
  const [cellChanges, setCellChanges] = useState<CellChange<TextCell>[][]>([])
  // Track selected rows and columns for deletion
  const [selectedRows, setSelectedRows] = useState<string[]>([])
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])

  useEffect(() => {
    setGridColumns(initialColumns)
    setGridRows(reactGridRows)
  }, [isTransposed])

  const handleColumnResize = (columnId: string, width: number) => {
    setGridColumns((prevColumns) => {
      const columnIndex = prevColumns.findIndex((el) => el.columnId === columnId)
      if (columnIndex === -1) return prevColumns
      const updatedColumn = { ...prevColumns[columnIndex], width }
      const newColumns = [...prevColumns]
      newColumns[columnIndex] = updatedColumn
      return newColumns
    })
  }

  const handleColumnsReorder = (
    targetColumnId: string | number,
    columnIds: (string | number)[]
  ) => {
    setGridColumns((prevColumns) => {
      const toIndex = prevColumns.findIndex((column) => column.columnId === targetColumnId)
      const columnIdxs = columnIds.map((id) => prevColumns.findIndex((c) => c.columnId === id))
      return reorderArray(prevColumns, columnIdxs, toIndex)
    })
    setGridRows((prevRows) => {
      const toIndex = gridColumns.findIndex((column) => column.columnId === targetColumnId)
      const columnIdxs = columnIds.map((id) => gridColumns.findIndex((c) => c.columnId === id))
      return prevRows.map((row) => {
        const reorderedCells = reorderArray(row.cells, columnIdxs, toIndex)
        return { ...row, cells: reorderedCells }
      })
    })
  }

  const handleRowsReorder = (targetRowId: string | number, rowIds: (string | number)[]) => {
    setGridRows((prevRows) => {
      const header = prevRows[0]
      const dataRows = prevRows.slice(1)
      const toIndex = dataRows.findIndex((row) => row.rowId === targetRowId)
      if (toIndex === -1) return prevRows
      const fromIndexes = rowIds.map((id) => dataRows.findIndex((r) => r.rowId === id))
      const reorderedDataRows = reorderArray(dataRows, fromIndexes, toIndex)
      return [header, ...reorderedDataRows]
    })
  }

  const applyChangesToRows = (changes: CellChange<TextCell>[], rows: Row[]): Row[] => {
    const updatedRows = [...rows]
    changes.forEach((change) => {
      const rowIndex = updatedRows.findIndex((row) => row.rowId === change.rowId)
      if (rowIndex === -1) return
      const cellIndex = gridColumns.findIndex((col) => col.columnId === change.columnId)
      if (cellIndex === -1) return
      const newRowCells = [...updatedRows[rowIndex].cells]
      newRowCells[cellIndex] = { ...newRowCells[cellIndex], ...change.newCell }
      updatedRows[rowIndex] = { ...updatedRows[rowIndex], cells: newRowCells }
    })
    return updatedRows
  }

  const undoChanges = (changes: CellChange<TextCell>[], rows: Row[]): Row[] => {
    const updatedRows = [...rows]
    changes.forEach((change) => {
      const rowIndex = updatedRows.findIndex((row) => row.rowId === change.rowId)
      if (rowIndex === -1) return
      const cellIndex = gridColumns.findIndex((col) => col.columnId === change.columnId)
      if (cellIndex === -1) return
      const newRowCells = [...updatedRows[rowIndex].cells]
      newRowCells[cellIndex] = {
        ...newRowCells[cellIndex],
        text: (change.previousCell as TextCell).text
      }
      updatedRows[rowIndex] = { ...updatedRows[rowIndex], cells: newRowCells }
    })
    return updatedRows
  }

  const updateDataFromRows = (rows: Row[]) => {
    if (!originalData) return

    const newChartRows = rows
      .filter((row) => row.rowId !== 'header')
      .map((row) => {
        const dataPoint: { [key: string]: any } = {}
        row.cells.forEach((cell, cellIdx) => {
          const field = gridColumns[cellIdx].columnId
          const numericValue = parseFloat((cell as TextCell).text)
          dataPoint[field] = isNaN(numericValue) ? (cell as TextCell).text : numericValue
        })
        return dataPoint
      })

    const newData: ReshapedChartData = {
      ...originalData,
      chart: newChartRows
    }

    onDataChange(newData)
  }

  const handleCellsChanged = (changes: CellChange<TextCell>[]) => {
    if (!originalData) return

    const updatedRows = applyChangesToRows(changes, gridRows)
    setGridRows(updatedRows)
    const newCellChanges = cellChanges.slice(0, cellChangesIndex + 1)
    newCellChanges.push(changes)
    setCellChanges(newCellChanges)
    setCellChangesIndex(newCellChanges.length - 1)
    updateDataFromRows(updatedRows)
  }

  const handleUndoChanges = () => {
    if (cellChangesIndex >= 0) {
      const updatedRows = undoChanges(cellChanges[cellChangesIndex], gridRows)
      setGridRows(updatedRows)
      setCellChangesIndex(cellChangesIndex - 1)
      updateDataFromRows(updatedRows)
    }
  }

  const handleRedoChanges = () => {
    if (cellChangesIndex + 1 <= cellChanges.length - 1) {
      const updatedRows = applyChangesToRows(cellChanges[cellChangesIndex + 1], gridRows)
      setGridRows(updatedRows)
      setCellChangesIndex(cellChangesIndex + 1)
      updateDataFromRows(updatedRows)
    }
  }

  // Delete selected rows and columns
  const handleDelete = () => {
    if (selectedColumns.length > 0) {
      const updatedColumns = gridColumns.filter(col => !selectedColumns.includes(col.columnId as string))
      const updatedRows = gridRows.map(row => ({
        ...row,
        cells: row.cells.filter((_, cellIdx) => !selectedColumns.includes(gridColumns[cellIdx].columnId as string))
      }))
      setGridColumns(updatedColumns)
      setGridRows(updatedRows)
      setSelectedColumns([])
      updateDataFromRows(updatedRows)
    }
    if (selectedRows.length > 0) {
      const updatedRows = gridRows.filter(row => !selectedRows.includes(row.rowId as string))
      setGridRows(updatedRows)
      setSelectedRows([])
      updateDataFromRows(updatedRows)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((!isMacOs() && e.ctrlKey) || e.metaKey) {
      switch (e.key) {
        case 'z':
          e.preventDefault()
          handleUndoChanges()
          return
        case 'y':
          e.preventDefault()
          handleRedoChanges()
          return
      }
    }
    // Handle delete key for rows and columns
    if (e.key === 'Delete') {
      e.preventDefault()
      handleDelete()
      return
    }
  }

  if (!gridColumns.length || !gridRows.length) {
    return (
      <div>
        <Button type="button" variant="contained" onClick={onToggleTranspose} sx={{ mb: 2 }}>
          {isTransposed ? 'Transpose' : 'Transpose'}
        </Button>
        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <p>No data to display</p>
        </div>
      </div>
    )
  }

  return (
    <div onKeyDown={handleKeyDown}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <Button type="button" variant="contained" onClick={onToggleTranspose}>
          {isTransposed ? 'Transpose' : 'Transpose'}
        </Button>
        <Button
          type="button"
          variant="outlined"
          onClick={handleUndoChanges}
          disabled={cellChangesIndex < 0}
        >
          Undo
        </Button>
        <Button
          type="button"
          variant="outlined"
          onClick={handleRedoChanges}
          disabled={cellChangesIndex >= cellChanges.length - 1}
        >
          Redo
        </Button>
      </div>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div
          style={{
            maxWidth: '100%',
            maxHeight: '400px',
            overflow: 'auto',
            display: 'inline-block'
          }}
        >
          <ReactGrid
            rows={gridRows}
            columns={gridColumns}
            onCellsChanged={handleCellsChanged}
            onColumnResized={handleColumnResize}
            onColumnsReordered={handleColumnsReorder}
            onRowsReordered={handleRowsReorder}
            enableRowSelection
            enableColumnSelection
            onRowSelectionChanged={setSelectedRows}
            onColumnSelectionChanged={setSelectedColumns}
          />
        </div>
      </div>
    </div>
  )
}

export default DataTable