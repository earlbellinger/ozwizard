/*  solvem.c -- gaussian elim linear eq solver w partial pivoting */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*      solves  a x = b, where a is an n x n matrix, x, b vectors */
/*      returns 1 if no problem,  0 otherwise                     */

/*  note:  matrix dimensions run from     0 -> NMAX               */
/*         matrix indices run from        1 -> n                  */

/*  rfs - 5/04 - ported from GNR1  (archive/qnx/GNR1)  */

#define EXTERN extern
#include "s_tran.h"

extern int ne;
extern double xx[MAX_LINES+1][MAX_FIELDS+1], yy[MAX_LINES+1];


int set_solve_data( )
{
    int i, j;
    double tmp;

    i = exptoi( "N" );
    if( !i )  do_error( "solve:  N = 0" );
    else      ne = i;

    for( i = 1; i <= ne; i++ ) {
        sprintf( stmp, "Y[%d]", i );
        tmp = exptof( stmp );
        yy[i] = tmp;
    }
    for( i = 1; i <= ne; i++ ) {
        for( j = 1; j <= ne; j++ ) {
            sprintf( stmp, "X[%d][%d]", i, j );
            tmp = exptof( stmp );
            xx[i][j] = tmp;
        }
    }
    return(1);
}


int solvem( int n, double a[MAX_LINES+1][MAX_FIELDS+1], double b[MAX_FIELDS+1], double x[MAX_FIELDS+1] )
{
    int ips[MAX_FIELDS+1], i2, i3, i4, i5, i, j, k, k1, k2, n1;
    double scale[MAX_FIELDS+1], r1, pivot, e1, s2, b1;

                                                /*  initialize row scales  */
    for( i = 1; i <= n; i++ ) {
        ips[i] = i;
        r1 = 0.;
        for( j = 1; j <= n; j++ ) {
            e1 = fabs( a[i][j] );
            if( e1 > r1 )  r1 = e1;
        }
        if( r1 == 0. ){
            printf( "\n*** solvem:  column %d is all zeros ***\n", i );
            return( 0 );
        }
        scale[i] = 1/r1;
    }
                                                /*  set pivot pointers  */
    n1 = n - 1;
    i3 = 1;
    for( k = 1; k <= n1; k++ ) {
        b1 = 0;
        for( i = k; i <= n; i++ ) {
            i2 = ips[i];
            s2 = fabs( a[i2][k] * scale[i2] );
            if( s2 > b1 ) {
                b1 = s2;
                i3 = i;
            }
        }
        if( i3 != k ) {
            j = ips[k];
            ips[k] = ips[i3];
            ips[i3] = j;
        }
                                                /*  ul decomposition  */
        k1 = ips[k];
        if( (pivot = a[k1][k]) == 0. ) {
            printf( "\n*** solvem:  zero pivot found, row %d ***\n", k );
            return( 0 );
        }
        k2 = k + 1;
        for( i = k2; i <= n; i++ ) {
            i2 = ips[i];
            e1 = -a[i2][k]/pivot;
            a[i2][k] = -e1;
            if( e1 != 0. ) {
                for( j = k2; j <= n; j++ ) {
                    a[i2][j] += e1 * a[k1][j];
                }
            }
        }
    }
                                                /*  forward elimination  */

    i2 = ips[1];
    x[1] = b[i2];
    for( i = 2; i <= n; i++ ) {
        i2 = ips[i];
        i3 = i-1;
        s2 = 0.;
        for( j = 1; j <= i3; j++ ) {
            s2 += a[i2][j] * x[j];
        }
        x[i] = b[i2] - s2;
    }
                                                /*  back substitution  */
    n1 = n + 1;
    i2 = ips[n];
    if( a[i2][n] == 0. ) {
        printf( "\n*** solvem:  singular matrix (pivot %d=0)***\n", n );
        return( 0 );
    }
    x[n] /= a[i2][n];
    for( i4 = 2; i4 <= n; i4++ ) {
        i = n1 - i4;
        i2 = ips[i];
        i5 = i + 1;
        s2 = 0.;
        for( j = i5; j <= n; j++ ) {
            s2 += a[i2][j] * x[j];
        }
        if( a[i2][i] == 0. ) {
            printf( "\n*** solvem:  singular matrix (pivot %d=0)***\n", n );
            return( 0 );
        }
        x[i] = (x[i] - s2)/a[i2][i];
    }

    return( 1 );
}

