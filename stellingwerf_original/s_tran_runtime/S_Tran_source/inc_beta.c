 /*  inc_beta  -  -  Incomplete beta function approximation         */ 
 /*  $Id: inc_beta.c,v 1.01 2005 / 8 / 15 01:19:42 rfs Exp rfs $  */ 

 /*   Based on Press et.al. "Numerical Recipes in C", betai()     */ 


#define EXTERN extern
#include "s_tran.h"

#define MAXIT 100
#define EPS 3.0e-7
#define FPMIN 1.0e-30

double inc_beta( double a, double b, double x )
{
    double beta2( double a, double b, double x );
    double gaml( double xx );
    double bt;

    if( x <=  0.0 || x >=  1.0 ) {
        bt = 0.0;
    }
    else {
        bt = exp(gaml(a + b) - gaml( a ) - gaml( b ) + a * log( x ) + b * log( 1.0 - x ));
    }
    if( x < (a + 1.0) / (a + b + 2.0) ) {
        return( bt * beta2( a, b, x) / a );
    }
    else {
        return( 1.0 - bt * beta2( b, a, 1.0 - x) / b );
    }
}


double beta2( double a, double b, double x )
{
    int m, m2;
    double aa, c, d, del, h, qab, qam, qap;

    qab = a + b;
    qap = a + 1.0;
    qam = a - 1.0;
    c = 1.0;
    d = 1.0 - qab * x / qap;
    if( fabs( d ) < FPMIN )  d = FPMIN;
    d = 1.0 / d;
    h = d;
    for( m = 1; m <= MAXIT; m++ ) {
        m2 = 2 * m;
        aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1.0 + aa * d;
        if( fabs( d) < FPMIN ) d = FPMIN;
        c = 1.0 + aa / c;
        if( fabs( c ) < FPMIN ) c = FPMIN;
        d = 1.0 / d;
        h  *=  d * c;
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1.0 + aa * d;
        if( fabs( d ) < FPMIN ) d = FPMIN;
        c = 1.0 + aa / c;
        if( fabs( c ) < FPMIN ) c = FPMIN;
        d = 1.0 / d;
        del = d * c;
        h  *=  del;
        if( fabs( del - 1.0 ) < EPS) break;
    }
    if( m > MAXIT ) {
        printf( "a or b too big, or MAXIT too small in beta2" );
    }
    return( h );
}

double gaml( double xx )
{
    double x, y, tmp, ser;
    static double cof[6] = {76.18009172947146, -86.50532032941677,
        24.01409824083091, -1.231739572450155,
        0.1208650973866179e-2, -0.5395239384953e-5};
    int j;

    y = x = xx;
    tmp = x + 5.5;
    tmp  -=  (x + 0.5) * log( tmp );
    ser = 1.000000000190015;
    for( j = 0; j <= 5; j++ ) ser += cof[j] / ++y;
    return( -tmp + log( (2.5066282746310005 * ser) / x ) );
}

