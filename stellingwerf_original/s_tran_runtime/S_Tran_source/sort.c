/*  sort.c - sort routines */
/*  $Id$  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <math.h>

#define EXTERN extern
#include "s_tran.h"

/*--------------------------------------------------------
===public functions====

Called from process_cmds()/command.c

set_sort_data() - initialize N, M, X[][]
h_sort() - sort an array
----------------------------------------------------------*/

extern double xx[MAX_LINES+1][MAX_FIELDS+1];
extern int ne, na;

int set_sort_data( char *var )
{
    int i, j;
    double tmp;

    i = exptoi( "N" );
    if( !i )  do_error( "sort:  N = 0" );
    else      ne = i;

    i = exptoi( "M" );
    if( !i )  do_error( "sort:  M = 0" );
    else      na = i;

    for( i = 1; i <= ne; i++ ) {
        for( j = 1; j <= na; j++ ) {
            if( var[0] ) sprintf( stmp, "%s[%d][%d]", var, i, j );
            else         sprintf( stmp, "X[%d][%d]", i, j );
            tmp = exptof( stmp );
            xx[i][j] = tmp;
        }
    }
    return(1);
}


/*  heap sort:
    sort on array dat.  Sort first on column 1, then 2, etc.
    n = number of rows to sort, so partial arrays can be handled
    m = number of columns in array
    array indices run from 1 -> n, and from 1 -> m          */


int h_sort( int n, int m, double dat[MAX_LINES+1][MAX_FIELDS+1] ) 
{
    int ihire, j, iret, i, ii;
    double tmp[MAX_FIELDS+1];

    if( n < 2 )  return( 0 );
    ihire = (n >> 1) + 1;
    iret = n;
    for( ;; ) {
        if( ihire > 1 ) {
            --ihire;                    /*  first hire workers  */
            for( ii = 1; ii <= m; ii++ ) {
                tmp[ii] = dat[ihire][ii];
            }
        }
        else {
            for( ii = 1; ii <= m; ii++ ) {
                tmp[ii] = dat[iret][ii];
            }
            for( ii = 1; ii <= m; ii++ ) {
                dat[iret][ii] = dat[1][ii];
            }
            if( --iret == 1 ) {          /*  then retire them  */
                for( ii = 1; ii <= m; ii++ ) {
                    dat[1][ii] = tmp[ii];
                }
                break;                  /*  done, exit here  */
            }
        }

        /*  bubble tmp down to its level  */
        i = ihire;                      /*  current level  */
        j = ihire + ihire;              /*  first underling   */
        while( j <= iret ) {
            
            if( j < iret ) {
                if( dat[j][1] < dat[j+1][1] )  goto true0;
                
                for( ii = 2; ii <= m; ii++ ) {
                    if( dat[j][ii-1] > dat[j+1][ii-1] )  goto out0;
                    if( dat[j][ii] < dat[j+1][ii] )  goto true0;
                }
            }
            goto out0;
true0:
            j++;
out0:
            if( tmp[1] < dat[j][1] )  goto true1;
            for( ii = 2; ii <= m; ii++ ) {
                if( tmp[ii-1] > dat[j][ii-1] )  goto else1;
                if( tmp[ii] < dat[j][ii] )  goto true1;
            }
            goto else1;
true1:
            for( ii = 1; ii <= m; ii++ ) {
                dat[i][ii] = dat[j][ii];
            }
            i = j;
            j <<= 1;
            goto out1;
else1:
            j = iret + 1;
out1:
            for( ii = 1; ii <= m; ii++ ) {
                dat[i][ii] = tmp[ii];
            }
        }
    }
    return(1);
}

