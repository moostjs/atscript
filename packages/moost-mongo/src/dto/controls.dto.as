export interface QueryControlsDto {
    $skip?: number.int.positive
    $limit?: number.int.positive
    $count?: boolean
    $sort?: SortControlDto
    $select?: SelectControlDto
    $search?: string
    $index?: string
}

export interface PagesControlsDto {
    @expect.pattern "^\d+$", "u", "Expected positive number" 
    $page?: string
    @expect.pattern "^\d+$", "u", "Expected positive number" 
    $size?: string
    $sort?: SortControlDto
    $select?: SelectControlDto
    $search?: string
    $index?: string
}

export interface GetOneControlsDto {
    $select?: SelectControlDto
}

interface SortControlDto {
    [*]: 1 | -1
}

interface SelectControlDto {
    [*]: 1 | 0
}
