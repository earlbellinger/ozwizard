/*  coranal.c - analyze the correlation matrix for groups  */
/* $Id: coranal.c,v 1.12 1997/11/15 01:19:42 rfs Exp rfs $  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*  based on simple multiple path analysis  */
/*    transform cor matrix into block diagonal, with threshold  */
/*  8/97 - rfs */
/*  9/97 - rfs - missing data treatment added   */
/*  5/04 - rfs - ported to "S"  */


/*  this is a stand-alone package, no libraries are required  */

/*
purpose:  analyze structure of correlation matrix
usage:    coranal [file [r threshold [debug]]]  
          threshold is the r limit for clustering
          debug = 1 for diagnostics
*/

#define EXTERN extern
#include "s_tran.h"

#define MAXN  50                                /*  max variables  */
#define MAXM  10000                             /*  max data pts  */

                                                /*  prototypes  */
static int disp_r( void );
static int promote( int i, int j );

static double x[MAXN+1][MAXM+1];
static double s1[MAXN+1][MAXN+1], a[MAXN+1][MAXN+1], s2[MAXN+1][MAXN+1], str[MAXN+1];
static int newgrp[MAXN+1], sign[MAXN+1], count[MAXN+1][MAXN+1];
static int n, m, move1, nblanks;
static char work_file[51];

static double threshold = 0.8;

extern int na, ne;
extern double tol1;
extern char Labels[MAX_FIELDS+1][FIELD_LEN+1];
extern double xx[MAX_LINES+1][MAX_FIELDS+1];


int coranal()
{
    int curr_var, curr_grp;
    double maxr=0., old_maxr, tmp=0.;
    int old_move1, grp2=0;

    int i, j, t, imax=0, jmax=0;
    int i0, out;

    if( tol1 ) {
        threshold = tol1;
    }
    n = na;
    m = ne;

    if( debug )  printf( "file=%s, thresh=%f, debug=%d\n", work_file, threshold, debug );

    nblanks = 0;
    for( i = 1; i <= m; i++ ) {
        for( j = 1; j <= n; j++ ) {
            x[j][i] = xx[i][j];
            if( x[i][j] == MISS )  nblanks++;
        }
    }
                                                /*  correlation matrix  */
    for( i = 1; i <= n; i++ ) {
        for( j = 1; j <= n; j++ ) {
            a[i][j] = 0.;
            s1[i][j] = 0;
            s2[i][j] = 0;
            for( t = 1; t <= m; t++ ) {
                if( x[i][t] != MISS && x[j][t] != MISS ) {
                    a[i][j] += x[i][t] * x[j][t];
                    s2[i][j] += x[i][t] * x[i][t];
                    s1[i][j] += x[i][t];
                    count[i][j]++;
                }
            }
            if( count[i][j] )  s1[i][j] /= count[i][j];
            if( debug ) printf( "%d,%d: cij=%d aij=%g s1ij=%g s2ij=%g\n", i, j, count[i][j], a[i][j], s1[i][j], s2[i][j] );
        }
    }
    if( debug )  getchar();
                                                /*  diags  */
    for( i = 1; i <= n; i++ ) {
        s1[i][i] = 0;
        s2[i][i] = 0;
        if( !count[i][i] ) {
            printf( "--> Warning: variable %s has no data\n", Labels[i] );
        }
        count[i][i] = 0;
        for( t = 1; t <= m; t++ ) {
            out = 0;

/*  --old missing data scheme - gives 0 for any missing data--
            for( j = 1; j <= n; j++ ) {
                if( x[j][t] == MISS )  out = 1;
            }
*/
            if( x[i][t] == MISS )  out = 1;

            if( out )  continue;
            s2[i][i] += x[i][t] * x[i][t];
            s1[i][i] += x[i][t];
            count[i][i]++;
        }
        if( count[i][i] )  s1[i][i] /= count[i][i];
        if( debug ) printf( "%d,%d: cij=%d       s1ij=%g s2ij=%g\n", i, i, count[i][i], s1[i][i], s2[i][i] );
    }
    for( i = 1; i <= n; i++ ) {
        for( j = 1; j <= n; j++ ) {
            a[i][j] -= s1[i][j] * s1[j][i] * count[i][j];
            s2[i][j] -= s1[i][j] * s1[i][j] * count[i][j];
            s2[i][j] = sqrt( s2[i][j] );
            if( debug )  printf( "%d / %d  aij=%g  s2ij=%g\n", i, j, a[i][j], s2[i][j] );
        }
    }
    for( i = 1; i <= n-1; i++ ) {
        for( j = i+1; j <= n; j++ ) {
            if( s2[i][j]*s2[j][i] != 0. )  a[i][j] /= (s2[i][j] * s2[j][i]);
            else                           a[i][j] = 0.;
            a[j][i] = a[i][j];
        }
    }
    for( i = 1; i <= n; i++ ) {
        a[i][i] = 1.;
        sign[i] = 1;
    }
                                                /*  print problem summary  */

    printf( "\nCORANAL.C:  variables = %d,  data pts = %d\n", n, m );
    printf( "    Total data fields = %d, missing = %d (%.2f%%)\n", n * m, nblanks, 100.*nblanks/(n*m) );

                                                /*  begin computation  */
    i0 = 1;
    curr_var = 1;
    curr_grp = 1;
                                                /*  find max rij  */
    for( ;; ) {

        old_maxr = maxr;
        maxr = 0.;
        old_move1 = move1;
        move1 = 0;
        for( i = 1; i <= curr_var-1; i++ ) {
            for( j = curr_var; j <= n; j++ ) {
                tmp = fabs( a[i][j] );
                if( tmp > maxr && tmp > threshold ) {
                    maxr = tmp;
                    imax = i;
                    jmax = j;
                    move1 = 1;
                }
            }
        }
        if( !move1 ) {
            for( i = curr_var; i <= n-1; i++ ) {
                for( j = i+1; j <= n; j++ ) {
                    tmp = fabs( a[i][j] );
                    if( tmp > maxr ) {
                        maxr = tmp;
                        imax = i;
                        jmax = j;
                        move1 = 0;
                    }
                }
            }
        }

        if( debug )  disp_r();

        printf( "\nStep %d, a(%d, %d) = %g  curr=%d [m1=%d]\n", i0, imax, jmax, a[imax][jmax], curr_var, move1 ); 

        if( move1 == 0 ) {
            str[curr_var] = str[curr_var+1] = maxr;
            if( i0 > 1 ) {
                newgrp[curr_var] = 1;
                /*  flag the non-significant groups  */
                if( maxr < threshold ) {
                    if( !grp2 )  newgrp[curr_var] = 3;
                    else         newgrp[curr_var] = 2;
                    grp2 = 1;
                }
                curr_grp = curr_var;
                if( debug )  printf( "  ...group boundary set at %d\n", curr_var );
            }
        }

                                                /*  rearrange a[][]  */
        if( move1 ) {
            str[curr_var] = maxr;
            promote( curr_var, jmax );

            /*  use entire column to determine direct or anti corr  */
            for( i = curr_grp; i <= curr_var-1; i++ )  tmp += sign[i] * a[curr_var][i];
            if( tmp < 0. )  sign[curr_var] = -1;
            if( debug )  printf( "  ----curr=%d  grp=%d  sum=%g\n", curr_var, curr_grp, tmp );

            curr_var++;
        }
        else {
            promote( curr_var, imax );
            curr_var++;
            promote( curr_var, jmax );
            if( a[curr_var][curr_var-1] < 0. )  sign[curr_var] = -1;
            if( debug )  printf( "  -->>curr=%d  i=%d  j=%d  a=%g\n", curr_var, imax, jmax, a[curr_var][curr_var-1] );
            curr_var++;
        }
        if( curr_var >= n )  break;
        i0++;
    }
                                                /*  check last column  */
    if( move1 ) {
        for( i = 1; i <= n-1; i++ ) {
            if( fabs( a[i][n] ) > threshold )  break;
        }
        if( i == n )  newgrp[n] = 3;
        if( debug )  printf( "i=%d, n=%d, ngrp=%d \n", i, n, newgrp[n] );
    }

    disp_r();

    printf( "\n\nNo Further Significant Groups\n" );

    return(1);
}

                                                /*  print r array  */
int disp_r()
{
    int i, j;

    printf( "\nVariables (r thresh=%.2f):\n", threshold );
    for( j = 1; j <= n; j++ ) { 
        if( newgrp[j] == 1 )       printf( "------------------------------\n" );
        else if( newgrp[j] == 3 )  printf( "---x---x---x---x---x---x---x--\n" );
        else if( newgrp[j] == 2 )  printf( "..............................\n" );
        printf( "V %3d = %15s (%.2f)", j, Labels[j], str[j] );
        if( sign[j] < 0. )  printf( " - anti" );
        printf( "\n" );
    }
    printf( "\nCorrelation Coefficients:\n" );
    printf( "    " );
    for( i = 1; i <= n; i++ )  printf( "%3d ", i );
    printf( "\n" );
    for( i = 1; i <= n; i++ ) {
        if( newgrp[i] == 1 )       printf( "\n-------------------------" );
        else if( newgrp[i] == 3 )  printf( "\n---x---x---x---x---x---x" );
        else if( newgrp[i] == 2 )  printf( "\n........................." );
        printf( "\n%3d:", i );
        for( j = 1; j <= n; j++ ) {
            printf( "%3d ", (int)(100 * a[i][j]) );
        }
    }
    printf( "\n" );

    return(1);
}

                                                /*  move row j to i  */
int promote( int irow, int jrow )
{
    int i, j;
    double row[MAXN+1], col[MAXN+1], tmp;
    char stmp[11];
                                                /*  store row, col j */
    printf( "Promote: move %d to %d\n", jrow, irow );

    if( irow >= jrow )  return (0 );

    for( i = 1; i <= n; i++ ) {
        row[i] = a[jrow][i];
        col[i] = a[i][jrow];
    }
                                                /*  fix row and col  */
    tmp = a[jrow][jrow];
    strcpy( stmp, Labels[jrow] );
    for( j = jrow; j > irow; j-- ) {
        row[j] = row[j-1];
        col[j] = col[j-1];
        strcpy( Labels[j], Labels[j-1] );
    }
    row[irow] = col[irow] = tmp;
    strcpy( Labels[irow], stmp );
    /*
    if( debug )  for( i = 1; i <= n; i++ ) printf( "%2d (%10s %10s) new row=%6.2g\n", i, Labels[i], Labels[irow], row[i] );
    */
                                                /*  move upper right block  */
    for( i = jrow+1; i <= n; i++ ) {
        for( j = jrow; j > irow; j-- ) {
            a[i][j] = a[i][j-1];
        }
    }
                                                /*  move left block  */
    for( i = 1; i <= irow-1; i++ ) {
        for( j = jrow; j > irow; j-- ) {
            a[i][j] = a[i][j-1];
        }
    }
                                                /*  move lower left block  */
    for( i = jrow; i > irow; i-- ) {
        for( j = jrow+1; j <= n; j++ ) {
            a[i][j] = a[i-1][j];
        }
    }
                                                /*  move upper block  */
    for( i = jrow; i > irow; i-- ) {
        for( j = 1; j <= irow-1; j++ ) {
            a[i][j] = a[i-1][j];
        }
    }
                                                /*  move central block  */
    for( i = jrow; i > irow; i-- ) {
        for( j = jrow; j > irow; j-- ) {
            a[i][j] = a[i-1][j-1];
        }
    }
                                                /*  patch row and col  */
    for( i = 1; i <= n; i++ ) {
        a[irow][i] = row[i];
        a[i][irow] = col[i];
    }
    return(1);
}



